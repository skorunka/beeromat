'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/session';
import { members } from '@/lib/db/schema/members';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';

// US4 — treasurer records a payment out-of-band. contracts/payments.md
// → recordManualPayment. Skips the `claimed` state: the row is created
// directly as `confirmed` with `treasurer_initiated` origin.

const inputSchema = z.object({
  memberId: z.string().uuid(),
  // bigint serialised as a digit string across the client boundary.
  amountMinor: z.string().regex(/^\d+$/),
  note: z.string().max(500).optional(),
});

export type RecordManualPaymentResult =
  | { ok: true; paymentId: string }
  | { ok: false; code: 'INVALID_INPUT' | 'NOT_FOUND' };

export async function recordManualPaymentAction(
  rawInput: unknown,
): Promise<RecordManualPaymentResult> {
  const ctx = await requireRole('treasurer', 'club_admin');

  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const amountMinor = BigInt(parsed.data.amountMinor);
  if (amountMinor <= 0n) return { ok: false, code: 'INVALID_INPUT' };

  const member = await db.query.members.findFirst({
    where: and(eq(members.id, parsed.data.memberId), eq(members.clubId, ctx.club.id)),
  });
  if (!member) return { ok: false, code: 'NOT_FOUND' };

  const note = parsed.data.note?.trim() || null;

  const payment = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(payments)
      .values({
        clubId: ctx.club.id,
        memberId: member.id,
        amountMinor,
        currencyCode: ctx.club.currencyCode,
        status: 'confirmed',
        origin: 'treasurer_initiated',
        variableSymbol: null,
        note,
        createdByUserId: ctx.user.id,
      })
      .returning();
    if (!row) throw new Error('recordManualPayment: payment insert failed');

    await tx.insert(paymentStateTransitions).values({
      clubId: ctx.club.id,
      paymentId: row.id,
      fromStatus: null,
      toStatus: 'confirmed',
      reason: note,
      createdByUserId: ctx.user.id,
    });
    return row;
  });

  revalidatePath('/admin/balances');
  revalidatePath(`/admin/balances/${member.id}`);
  return { ok: true, paymentId: payment.id };
}
