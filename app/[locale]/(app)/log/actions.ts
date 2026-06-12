'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db/client';
import { requireMember, requireUnlocked } from '@/lib/auth/session';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { hasAnyRole } from '@/lib/permissions';
import { memberBalance } from '@/lib/balance/calculate';
import { logRoundSchema } from '@/lib/validation/round';

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

  // memberBalance() must run AFTER the transaction commits — it uses the
  // global db client (separate connection), so a read from inside the
  // tx callback sees pre-insert state and the toast lies about the new
  // balance. Bug reported 2026-05-27. Fix: tx returns only the
  // identifiers; the balance is read on the next line, post-commit.
  const txResult = await db.transaction(async (tx) => {
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
      // Auto-opened sessions get no title — startedAt already carries
      // the date, and the history list renders it via Intl.* on read.
      // The title field stays available for explicit human labels
      // (e.g. a future "Friday match" feature) — null here makes the
      // history fallback ("Round" / "Pivo") kick in.
      //
      // Race-safe: the partial unique index uniq_drink_sessions_club_open
      // permits only one open session per club. Two members tapping log
      // simultaneously (no round open yet) both pass the find above, so
      // swallow the conflict with onConflictDoNothing and re-select
      // rather than 500 on the second insert's unique violation.
      await tx
        .insert(drinkSessions)
        .values({
          clubId: ctx.club.id,
          openedByUserId: ctx.user.id,
          startedAt: new Date(),
        })
        .onConflictDoNothing();
      openSession = await tx.query.drinkSessions.findFirst({
        where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
      });
      if (!openSession) throw new Error('Failed to auto-open drink session');
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
    // The home screen shows the outstanding balance — refresh it too so
    // a just-logged (or just-undone) beer is reflected without a manual
    // revisit (v1.3 UX review F2).
    revalidatePath('/');

    return {
      ok: true as const,
      consumptionId: consumption.id,
      sessionId: openSession.id,
    };
  });

  if (!txResult.ok) return txResult;
  return {
    ...txResult,
    balanceAfterMinor: await memberBalance(ctx.member.id),
  };
}

// Spec 019 — on-behalf log result. Success does NOT include the
// actor's balance because the actor's balance is unchanged; the
// target's tab was affected. The caller surfaces the target name
// in the toast.
export type LogBeerOnBehalfResult =
  | {
      ok: true;
      consumptionId: string;
      targetMemberId: string;
    }
  | { ok: false; code: 'BEER_NOT_AVAILABLE' | 'OUT_OF_STOCK' | 'TARGET_NOT_IN_CLUB' | 'TARGET_IS_SELF' };

/**
 * Spec 019 — log a single consumption on behalf of an absent
 * member of the same club. Same shape as a self-log except
 * `member_id = target` and `created_by_user_id = actor`.
 * Stock decrement + audit row are identical to `logBeerAction`.
 *
 * The absent member discovers the log via the home review banner
 * (spec 019 US2). They can reject via the extended
 * `voidConsumptionAction` (spec 019 FR-006 authz clause).
 */
export async function logBeerOnBehalfAction(input: {
  beerTypeId: string;
  targetMemberId: string;
}): Promise<LogBeerOnBehalfResult> {
  const ctx = await requireUnlocked();

  // Cheap pre-checks outside the transaction.
  if (input.targetMemberId === ctx.member.id) {
    return { ok: false, code: 'TARGET_IS_SELF' } as const;
  }

  return db.transaction(async (tx) => {
    // 1. Verify target is an active member of the same club.
    const targetMember = await tx.query.members.findFirst({
      where: and(
        eq(members.id, input.targetMemberId),
        eq(members.clubId, ctx.club.id),
        eq(members.isActive, true),
      ),
    });
    if (!targetMember) return { ok: false, code: 'TARGET_NOT_IN_CLUB' } as const;

    // 2. Verify the beer type belongs to this club and is active.
    const beer = await tx.query.beerTypes.findFirst({
      where: and(
        eq(beerTypes.id, input.beerTypeId),
        eq(beerTypes.clubId, ctx.club.id),
        eq(beerTypes.isArchived, false),
      ),
    });
    if (!beer) return { ok: false, code: 'BEER_NOT_AVAILABLE' } as const;

    // 3. Atomically decrement stock.
    const decremented = await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} - 1` })
      .where(and(eq(beerTypes.id, beer.id), sql`${beerTypes.currentStock} > 0`))
      .returning({ currentStock: beerTypes.currentStock });
    if (decremented.length === 0) return { ok: false, code: 'OUT_OF_STOCK' } as const;

    // 4. Audit row.
    await tx.insert(stockChanges).values({
      clubId: ctx.club.id,
      beerTypeId: beer.id,
      delta: -1,
      kind: 'consumption_decrement',
      createdByUserId: ctx.user.id,
    });

    // 5. Get-or-auto-open the drink session. Race-safe via
    //    onConflictDoNothing + re-select (see logBeerAction note).
    let openSession = await tx.query.drinkSessions.findFirst({
      where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
    });
    if (!openSession) {
      await tx
        .insert(drinkSessions)
        .values({
          clubId: ctx.club.id,
          openedByUserId: ctx.user.id,
          startedAt: new Date(),
        })
        .onConflictDoNothing();
      openSession = await tx.query.drinkSessions.findFirst({
        where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
      });
      if (!openSession) throw new Error('Failed to auto-open drink session');
    }

    // 6. Insert the consumption on the TARGET, attributed to the ACTOR.
    const [consumption] = await tx
      .insert(consumptions)
      .values({
        clubId: ctx.club.id,
        drinkSessionId: openSession.id,
        memberId: targetMember.id,
        beerTypeId: beer.id,
        unitPriceMinorSnapshot: beer.unitPriceMinor,
        createdByUserId: ctx.user.id,
      })
      .returning();
    if (!consumption) throw new Error('Failed to insert consumption');

    revalidatePath('/');
    revalidatePath('/log');
    revalidatePath('/tab');

    return {
      ok: true,
      consumptionId: consumption.id,
      targetMemberId: targetMember.id,
    } as const;
  });
}

// Spec 033 — log a "round": one beer per selected drinker, each on
// that drinker's OWN tab, written in a single transaction. A self-item
// (memberId == actor's member) is an ordinary self-log (no "logged for
// you" review, because created_by == the member's own user); every
// other item is an on-behalf log (one review item each). Out-of-stock /
// unavailable / not-in-club items are SKIPPED and reported — the round
// is not rejected wholesale (FR-009). The drink session is opened
// lazily on the first logged item, so an all-skipped round writes
// nothing (no empty session).
export type LogRoundSkip = {
  memberId: string;
  beerTypeId: string;
  reason: 'OUT_OF_STOCK' | 'BEER_NOT_AVAILABLE' | 'TARGET_NOT_IN_CLUB';
};

export type LogRoundResult =
  | {
      ok: true;
      logged: { memberId: string; beerTypeId: string; consumptionId: string }[];
      skipped: LogRoundSkip[];
      sessionId: string;
      /** Actor's balance AFTER commit — changes only if the actor was a drinker. */
      balanceAfterMinor: bigint;
    }
  | { ok: false; code: 'EMPTY' | 'ALL_SKIPPED' };

export async function logRoundAction(input: {
  items: { memberId: string; beerTypeId: string }[];
}): Promise<LogRoundResult> {
  const ctx = await requireUnlocked();

  const parsed = logRoundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'EMPTY' } as const;
  const items = parsed.data.items;

  const txResult = await db.transaction(async (tx) => {
    // Lazy session: opened on the first item that actually logs, so an
    // all-skipped round leaves no empty session behind. Race-safe via
    // onConflictDoNothing + re-select (see logBeerAction).
    let openSessionId: string | null = null;
    async function ensureSession(): Promise<string> {
      if (openSessionId) return openSessionId;
      let session = await tx.query.drinkSessions.findFirst({
        where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
      });
      if (!session) {
        await tx
          .insert(drinkSessions)
          .values({ clubId: ctx.club.id, openedByUserId: ctx.user.id, startedAt: new Date() })
          .onConflictDoNothing();
        session = await tx.query.drinkSessions.findFirst({
          where: and(eq(drinkSessions.clubId, ctx.club.id), isNull(drinkSessions.endedAt)),
        });
        if (!session) throw new Error('Failed to auto-open drink session');
      }
      openSessionId = session.id;
      return openSessionId;
    }

    const logged: { memberId: string; beerTypeId: string; consumptionId: string }[] = [];
    const skipped: LogRoundSkip[] = [];

    for (const item of items) {
      // 1. Drinker must be an active member of the actor's club (self
      //    qualifies). A foreign/inactive member can't mint a tab row.
      const target = await tx.query.members.findFirst({
        where: and(
          eq(members.id, item.memberId),
          eq(members.clubId, ctx.club.id),
          eq(members.isActive, true),
        ),
      });
      if (!target) {
        skipped.push({ ...item, reason: 'TARGET_NOT_IN_CLUB' });
        continue;
      }

      // 2. Beer must belong to the club + not be archived.
      const beer = await tx.query.beerTypes.findFirst({
        where: and(
          eq(beerTypes.id, item.beerTypeId),
          eq(beerTypes.clubId, ctx.club.id),
          eq(beerTypes.isArchived, false),
        ),
      });
      if (!beer) {
        skipped.push({ ...item, reason: 'BEER_NOT_AVAILABLE' });
        continue;
      }

      // 3. Atomic conditional decrement; no row → out of stock, skip.
      const decremented = await tx
        .update(beerTypes)
        .set({ currentStock: sql`${beerTypes.currentStock} - 1` })
        .where(and(eq(beerTypes.id, beer.id), sql`${beerTypes.currentStock} > 0`))
        .returning({ currentStock: beerTypes.currentStock });
      if (decremented.length === 0) {
        skipped.push({ ...item, reason: 'OUT_OF_STOCK' });
        continue;
      }

      // 4. Stock audit row (only for logged items).
      await tx.insert(stockChanges).values({
        clubId: ctx.club.id,
        beerTypeId: beer.id,
        delta: -1,
        kind: 'consumption_decrement',
        createdByUserId: ctx.user.id,
      });

      // 5. Consumption on the DRINKER, attributed to the ACTOR.
      const sessionId = await ensureSession();
      const [consumption] = await tx
        .insert(consumptions)
        .values({
          clubId: ctx.club.id,
          drinkSessionId: sessionId,
          memberId: target.id,
          beerTypeId: beer.id,
          unitPriceMinorSnapshot: beer.unitPriceMinor,
          createdByUserId: ctx.user.id,
        })
        .returning();
      if (!consumption) throw new Error('Failed to insert consumption');
      logged.push({ memberId: target.id, beerTypeId: beer.id, consumptionId: consumption.id });
    }

    if (logged.length === 0) {
      // Nothing logged (all out of stock / unavailable / not-in-club).
      // ensureSession was never reached → no rows written this tx.
      return { ok: false, code: 'ALL_SKIPPED' } as const;
    }

    revalidatePath('/');
    revalidatePath('/log');
    revalidatePath('/tab');

    return { ok: true as const, logged, skipped, sessionId: openSessionId! };
  });

  if (!txResult.ok) return txResult;
  return {
    ...txResult,
    balanceAfterMinor: await memberBalance(ctx.member.id),
  };
}

// Spec 019 — dismiss an on-behalf review banner row by stamping
// `consumptions.on_behalf_reviewed_at`. Idempotent in spirit (a
// second call returns ALREADY_REVIEWED but doesn't error). The
// row stays on the consumer's tab — dismissal means "keep, just
// stop showing me the banner". To void instead, use
// voidConsumptionAction (spec 019 extended its authz).
export type DismissOnBehalfReviewResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_AUTHORIZED' | 'ALREADY_REVIEWED' };

export async function dismissOnBehalfReviewAction(input: {
  consumptionId: string;
}): Promise<DismissOnBehalfReviewResult> {
  const ctx = await requireUnlocked();

  const consumption = await db.query.consumptions.findFirst({
    where: and(
      eq(consumptions.id, input.consumptionId),
      eq(consumptions.clubId, ctx.club.id),
    ),
  });
  if (!consumption) return { ok: false, code: 'NOT_FOUND' } as const;

  // Authz: only the consumer (consumption.member's user) may dismiss
  // their own banner. We trust ctx.member.id; consumption.memberId
  // must match.
  if (consumption.memberId !== ctx.member.id) {
    return { ok: false, code: 'NOT_AUTHORIZED' } as const;
  }
  if (consumption.onBehalfReviewedAt !== null) {
    return { ok: false, code: 'ALREADY_REVIEWED' } as const;
  }

  await db
    .update(consumptions)
    .set({ onBehalfReviewedAt: new Date() })
    .where(eq(consumptions.id, consumption.id));

  revalidatePath('/');
  revalidatePath('/tab');

  return { ok: true } as const;
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

  // memberBalance() reads via the global db client and would see
  // pre-void state from inside the tx callback (same bug pattern as
  // logBeerAction, fixed 2026-05-27). Return success identifiers from
  // the tx; read the balance after commit on the next line.
  const txResult = await db.transaction(async (tx) => {
    const consumption = await tx.query.consumptions.findFirst({
      where: and(eq(consumptions.id, input.consumptionId), eq(consumptions.clubId, ctx.club.id)),
    });
    if (!consumption) return { ok: false, code: 'NOT_FOUND' } as const;

    // Permission gate. Three accepted paths:
    //   1. The logger, within the per-club undo window (spec 001 US1).
    //   2. A stock_manager / treasurer / club_admin at any time
    //      (spec 001 FR-017 override).
    //   3. The consumer themselves, ONLY for on-behalf logs
    //      (spec 019 FR-006): consumer.member_id === consumption.memberId
    //      AND the consumption was logged by someone else
    //      (created_by_user_id !== consumer's user_id). No undo window —
    //      the absent member can always reject an on-behalf log they
    //      didn't accept.
    const isLogger = consumption.createdByUserId === ctx.user.id;
    const ageMs = Date.now() - consumption.createdAt.getTime();
    const inWindow = ageMs <= ctx.club.consumptionUndoWindowSeconds * 1000;
    const hasOverride = hasAnyRole(ctx.member.role, 'stock_manager');
    const isConsumerRejectingOnBehalf =
      consumption.memberId === ctx.member.id &&
      consumption.createdByUserId !== ctx.user.id;
    if (!((isLogger && inWindow) || hasOverride || isConsumerRejectingOnBehalf)) {
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
    // The home screen shows the outstanding balance — refresh it too so
    // a just-logged (or just-undone) beer is reflected without a manual
    // revisit (v1.3 UX review F2).
    revalidatePath('/');

    return { ok: true as const };
  });

  if (!txResult.ok) return txResult;
  return {
    ok: true as const,
    balanceAfterMinor: await memberBalance(ctx.member.id),
  };
}
