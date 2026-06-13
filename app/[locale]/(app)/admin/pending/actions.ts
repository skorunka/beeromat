'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/session';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';

// US3 — treasurer confirmation / dispute / void. contracts/payments.md.

function revalidateTreasurerViews(): void {
  revalidatePath('/admin/pending');
  revalidatePath('/admin/balances');
  revalidatePath('/');
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_STATE' | 'NOT_FOUND' };

/**
 * Single-tap confirmation of a claimed payment (SC-007a: one tap, no
 * form, no dialog). Transitions claimed → confirmed.
 */
export async function confirmPaymentAction(rawId: unknown): Promise<ConfirmResult> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const parsed = z.string().uuid().safeParse(rawId);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const paymentId = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await tx.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.clubId, ctx.club.id)),
    });
    if (!payment) return { ok: false, code: 'NOT_FOUND' } as const;
    if (payment.status !== 'claimed') return { ok: false, code: 'INVALID_STATE' } as const;

    await tx.update(payments).set({ status: 'confirmed' }).where(eq(payments.id, paymentId));
    await tx.insert(paymentStateTransitions).values({
      clubId: ctx.club.id,
      paymentId,
      fromStatus: 'claimed',
      toStatus: 'confirmed',
      createdByUserId: ctx.user.id,
    });

    revalidateTreasurerViews();
    return { ok: true } as const;
  });
}

export interface BulkConfirmResult {
  confirmed: string[];
  skipped: Array<{ paymentId: string; reason: 'INVALID_STATE' | 'NOT_FOUND' }>;
}

/**
 * Bulk confirmation — selection + one tap (≤ N+1 taps). Per-row
 * failures are reported in `skipped` and never abort the batch.
 */
export async function bulkConfirmPaymentsAction(
  rawIds: unknown,
): Promise<BulkConfirmResult> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const paymentIds = z.array(z.string().uuid()).min(1).max(100).parse(rawIds);

  return db.transaction(async (tx) => {
    const rows = await tx.query.payments.findMany({
      where: and(inArray(payments.id, paymentIds), eq(payments.clubId, ctx.club.id)),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const confirmed: string[] = [];
    const skipped: BulkConfirmResult['skipped'] = [];
    for (const id of paymentIds) {
      const row = byId.get(id);
      if (!row) {
        skipped.push({ paymentId: id, reason: 'NOT_FOUND' });
        continue;
      }
      if (row.status !== 'claimed') {
        skipped.push({ paymentId: id, reason: 'INVALID_STATE' });
        continue;
      }
      await tx.update(payments).set({ status: 'confirmed' }).where(eq(payments.id, id));
      await tx.insert(paymentStateTransitions).values({
        clubId: ctx.club.id,
        paymentId: id,
        fromStatus: 'claimed',
        toStatus: 'confirmed',
        createdByUserId: ctx.user.id,
      });
      confirmed.push(id);
    }

    if (confirmed.length > 0) revalidateTreasurerViews();
    return { confirmed, skipped };
  });
}

const reasonedInput = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export type ReasonedResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_STATE' | 'NOT_FOUND' | 'INVALID_INPUT' };

/**
 * Dispute a claimed payment that doesn't match the bank statement.
 * Transitions claimed → disputed; the balance is restored automatically
 * because only `confirmed` payments reduce it.
 */
export async function disputePaymentAction(rawInput: unknown): Promise<ReasonedResult> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const parsed = reasonedInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { paymentId, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await tx.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.clubId, ctx.club.id)),
    });
    if (!payment) return { ok: false, code: 'NOT_FOUND' } as const;
    if (payment.status !== 'claimed') return { ok: false, code: 'INVALID_STATE' } as const;

    await tx.update(payments).set({ status: 'disputed' }).where(eq(payments.id, paymentId));
    await tx.insert(paymentStateTransitions).values({
      clubId: ctx.club.id,
      paymentId,
      fromStatus: 'claimed',
      toStatus: 'disputed',
      reason,
      createdByUserId: ctx.user.id,
    });

    revalidateTreasurerViews();
    return { ok: true } as const;
  });
}

/**
 * Reverse a previously confirmed payment. Transitions confirmed →
 * voided; the balance is restored.
 */
export async function voidConfirmedPaymentAction(rawInput: unknown): Promise<ReasonedResult> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const parsed = reasonedInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { paymentId, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await tx.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.clubId, ctx.club.id)),
    });
    if (!payment) return { ok: false, code: 'NOT_FOUND' } as const;
    if (payment.status !== 'confirmed') return { ok: false, code: 'INVALID_STATE' } as const;

    await tx.update(payments).set({ status: 'voided' }).where(eq(payments.id, paymentId));
    await tx.insert(paymentStateTransitions).values({
      clubId: ctx.club.id,
      paymentId,
      fromStatus: 'confirmed',
      toStatus: 'voided',
      reason,
      createdByUserId: ctx.user.id,
    });

    revalidateTreasurerViews();
    return { ok: true } as const;
  });
}

export type HardDeletePaymentResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' };

/**
 * PERMANENTLY delete a payment row, ANY status (admin data reset). Unlike
 * dispute/void (which transition status + keep the row + an audit
 * transition), this removes the payment outright — for fake/test payments
 * an admin wants gone to reset the data. Its append-only
 * payment_state_transitions children (FK restrict) are dropped first.
 *
 * club_admin only (enforced at requireRole — stricter than the
 * treasurer-allowed confirm/dispute/void), club-scoped lookup. Balance
 * recomputes from the remaining payments, so deleting a confirmed payment
 * correctly re-adds what the member owed.
 */
export async function hardDeletePaymentAction(rawId: unknown): Promise<HardDeletePaymentResult> {
  const ctx = await requireRole('club_admin');
  const parsed = z.string().uuid().safeParse(rawId);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const paymentId = parsed.data;

  return db.transaction(async (tx) => {
    const payment = await tx.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.clubId, ctx.club.id)),
    });
    if (!payment) return { ok: false, code: 'NOT_FOUND' } as const;

    await tx
      .delete(paymentStateTransitions)
      .where(eq(paymentStateTransitions.paymentId, paymentId));
    await tx.delete(payments).where(eq(payments.id, paymentId));

    revalidateTreasurerViews();
    revalidatePath(`/admin/balances/${payment.memberId}`);
    return { ok: true } as const;
  });
}
