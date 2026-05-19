'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db/client';
import { requireMember, requireUnlocked } from '@/lib/auth/session';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { hasAnyRole } from '@/lib/permissions';
import { memberBalance } from '@/lib/balance/calculate';

export type LogBeerResult =
  | {
      ok: true;
      consumptionId: string;
      sessionId: string;
      balanceAfterMinor: bigint;
    }
  | { ok: false; code: 'BEER_NOT_AVAILABLE' | 'OUT_OF_STOCK' };

/**
 * Log a single consumption for the current member.
 * Atomically: auto-open session if needed → decrement stock →
 * insert consumption → write stock_changes audit row.
 */
export async function logBeerAction(input: {
  beerTypeId: string;
}): Promise<LogBeerResult> {
  const ctx = await requireUnlocked();

  return db.transaction(async (tx) => {
    // 1. Verify the beer type belongs to this club and is active.
    const beer = await tx.query.beerTypes.findFirst({
      where: and(
        eq(beerTypes.id, input.beerTypeId),
        eq(beerTypes.clubId, ctx.club.id),
        eq(beerTypes.isArchived, false),
      ),
    });
    if (!beer) return { ok: false, code: 'BEER_NOT_AVAILABLE' } as const;

    // 2. Atomically decrement stock; refuse if already 0 (FR-027).
    const decremented = await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} - 1` })
      .where(and(eq(beerTypes.id, beer.id), sql`${beerTypes.currentStock} > 0`))
      .returning({ currentStock: beerTypes.currentStock });
    if (decremented.length === 0) return { ok: false, code: 'OUT_OF_STOCK' } as const;

    // 3. Stock-changes audit row.
    await tx.insert(stockChanges).values({
      clubId: ctx.club.id,
      beerTypeId: beer.id,
      delta: -1,
      kind: 'consumption_decrement',
      createdByUserId: ctx.user.id,
    });

    // 4. Find or auto-open the drink session.
    let openSession = await tx.query.drinkSessions.findFirst({
      where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
    });
    if (!openSession) {
      const todayLabel = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
        dateStyle: 'long',
      }).format(new Date());
      const [created] = await tx
        .insert(drinkSessions)
        .values({
          clubId: ctx.club.id,
          openedByUserId: ctx.user.id,
          startedAt: new Date(),
          title: todayLabel,
        })
        .returning();
      if (!created) throw new Error('Failed to auto-open drink session');
      openSession = created;
    }

    // 5. Insert the consumption with price snapshot.
    const [consumption] = await tx
      .insert(consumptions)
      .values({
        clubId: ctx.club.id,
        drinkSessionId: openSession.id,
        memberId: ctx.member.id,
        beerTypeId: beer.id,
        unitPriceMinorSnapshot: beer.unitPriceMinor,
        createdByUserId: ctx.user.id,
      })
      .returning();
    if (!consumption) throw new Error('Failed to insert consumption');

    revalidatePath('/log');
    revalidatePath('/tab');

    return {
      ok: true,
      consumptionId: consumption.id,
      sessionId: openSession.id,
      balanceAfterMinor: await memberBalance(ctx.member.id),
    } as const;
  });
}

export type VoidConsumptionResult =
  | { ok: true; balanceAfterMinor: bigint }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_VOIDED' | 'FORBIDDEN' };

/**
 * Void a consumption. Permission:
 *   - Original logger within the club's undo window, OR
 *   - stock_manager / treasurer / club_admin at any time (FR-017).
 */
export async function voidConsumptionAction(input: {
  consumptionId: string;
  reason?: string;
}): Promise<VoidConsumptionResult> {
  const ctx = await requireMember();

  return db.transaction(async (tx) => {
    const consumption = await tx.query.consumptions.findFirst({
      where: and(eq(consumptions.id, input.consumptionId), eq(consumptions.clubId, ctx.club.id)),
    });
    if (!consumption) return { ok: false, code: 'NOT_FOUND' } as const;

    // Permission gate.
    const isLogger = consumption.createdByUserId === ctx.user.id;
    const ageMs = Date.now() - consumption.createdAt.getTime();
    const inWindow = ageMs <= ctx.club.consumptionUndoWindowSeconds * 1000;
    const hasOverride = hasAnyRole(ctx.member.role, 'stock_manager');
    if (!((isLogger && inWindow) || hasOverride)) {
      return { ok: false, code: 'FORBIDDEN' } as const;
    }

    // Single void per consumption (FR-018).
    const existingVoid = await tx.query.consumptionVoids.findFirst({
      where: eq(consumptionVoids.consumptionId, consumption.id),
    });
    if (existingVoid) return { ok: false, code: 'ALREADY_VOIDED' } as const;

    await tx.insert(consumptionVoids).values({
      clubId: ctx.club.id,
      consumptionId: consumption.id,
      reason: input.reason ?? null,
      voidedByUserId: ctx.user.id,
    });

    // Restore stock + audit row.
    await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} + 1` })
      .where(eq(beerTypes.id, consumption.beerTypeId));

    await tx.insert(stockChanges).values({
      clubId: ctx.club.id,
      beerTypeId: consumption.beerTypeId,
      delta: 1,
      kind: 'consumption_void_increment',
      createdByUserId: ctx.user.id,
    });

    revalidatePath('/log');
    revalidatePath('/tab');

    return {
      ok: true,
      balanceAfterMinor: await memberBalance(ctx.member.id),
    } as const;
  });
}
