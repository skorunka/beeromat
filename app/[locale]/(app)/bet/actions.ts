'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { roleSatisfies } from '@/lib/permissions';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { consumptions } from '@/lib/db/schema/consumption';
import { drinkSessions } from '@/lib/db/schema/sessions';

// US6 — inter-member bet settlement. contracts/bets.md.

function revalidateBetViews(): void {
  // The casual bet-settle UI now lives inside the /match hub.
  revalidatePath('/match');
  revalidatePath('/tab');
  revalidatePath('/');
}

export type CreateBetTransferResult =
  | { ok: true; betTransferId: string }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'OUT_OF_SCOPE' | 'ALREADY_TRANSFERRED' | 'SELF_TRANSFER' | 'INVALID_INPUT';
    };

/**
 * The loser of a bet transfers a winner's consumption onto their own
 * tab. Only consumptions in the currently-open session are eligible
 * (FR-020), and a consumption can carry at most one active transfer.
 */
export async function createBetTransferAction(
  rawInput: unknown,
): Promise<CreateBetTransferResult> {
  const ctx = await requireUnlocked();
  const parsed = z.object({ sourceConsumptionId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { sourceConsumptionId } = parsed.data;

  return db.transaction(async (tx) => {
    const consumption = await tx.query.consumptions.findFirst({
      where: and(
        eq(consumptions.id, sourceConsumptionId),
        eq(consumptions.clubId, ctx.club.id),
      ),
    });
    if (!consumption) return { ok: false, code: 'NOT_FOUND' } as const;

    // FR-020 — the source must live in the currently-open session.
    const session = await tx.query.drinkSessions.findFirst({
      where: eq(drinkSessions.id, consumption.drinkSessionId),
    });
    if (!session || session.endedAt !== null) {
      return { ok: false, code: 'OUT_OF_SCOPE' } as const;
    }

    if (consumption.memberId === ctx.member.id) {
      return { ok: false, code: 'SELF_TRANSFER' } as const;
    }

    // Reject if an active (un-voided) transfer already points at it.
    // A voided transfer leaves the consumption free to re-transfer.
    const priorTransfers = await tx
      .select({ voidId: betTransferVoids.id })
      .from(betTransfers)
      .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
      .where(eq(betTransfers.sourceConsumptionId, sourceConsumptionId));
    if (priorTransfers.some((row) => row.voidId === null)) {
      return { ok: false, code: 'ALREADY_TRANSFERRED' } as const;
    }

    const [transfer] = await tx
      .insert(betTransfers)
      .values({
        clubId: ctx.club.id,
        sourceConsumptionId,
        fromMemberId: consumption.memberId,
        toMemberId: ctx.member.id,
        createdByUserId: ctx.user.id,
      })
      .returning();
    if (!transfer) throw new Error('createBetTransfer: insert failed');

    revalidateBetViews();
    return { ok: true, betTransferId: transfer.id } as const;
  });
}

export type VoidBetTransferResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_VOIDED' | 'INVALID_INPUT' };

/**
 * Reverse a bet transfer. Allowed for the member who created it or for
 * a treasurer / club_admin (FR-023).
 */
export async function voidBetTransferAction(rawInput: unknown): Promise<VoidBetTransferResult> {
  const ctx = await requireUnlocked();
  const parsed = z
    .object({ betTransferId: z.string().uuid(), reason: z.string().max(500).optional() })
    .safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { betTransferId, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const transfer = await tx.query.betTransfers.findFirst({
      where: and(eq(betTransfers.id, betTransferId), eq(betTransfers.clubId, ctx.club.id)),
    });
    if (!transfer) return { ok: false, code: 'NOT_FOUND' } as const;

    const isCreator = transfer.createdByUserId === ctx.user.id;
    if (!isCreator && !roleSatisfies(ctx.member.role, 'treasurer')) {
      return { ok: false, code: 'FORBIDDEN' } as const;
    }

    const existingVoid = await tx.query.betTransferVoids.findFirst({
      where: eq(betTransferVoids.betTransferId, betTransferId),
    });
    if (existingVoid) return { ok: false, code: 'ALREADY_VOIDED' } as const;

    await tx.insert(betTransferVoids).values({
      clubId: ctx.club.id,
      betTransferId,
      reason: reason?.trim() || null,
      voidedByUserId: ctx.user.id,
    });

    revalidateBetViews();
    return { ok: true } as const;
  });
}
