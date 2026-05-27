'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { clubBankingProfiles } from '@/lib/db/schema/clubs';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';
import { getMyBalance } from '@/lib/db/queries/payments';
import { buildSpaydString } from '@/lib/qr-platba/spayd';
import { renderQrSvg } from '@/lib/qr-platba/render';
import { buildRevolutUrl } from '@/lib/qr-platba/revolut';

// US2 — member self-pay. contracts/payments.md.

export type InitiateSettleResult =
  | {
      ok: true;
      settle: {
        amountMinor: string; // bigint serialised for the client boundary
        currencyCode: string;
        variableSymbol: string;
        spaydPayload: string;
        qrSvg: string;
        revolutUrl: string | null;
        messageText: string;
      };
    }
  | { ok: false; reason: 'NO_BALANCE' | 'BANKING_NOT_CONFIGURED' | 'CLAIM_PENDING' };

/**
 * Generate payment instructions for the member's full outstanding
 * balance. Allocates a unique variable symbol, builds the SPAYD QR and
 * (if configured) a Revolut link. Does NOT create a Payment row — that
 * happens in confirmTransferMade once the member has actually paid.
 */
export async function initiateSettleAction(): Promise<InitiateSettleResult> {
  const ctx = await requireUnlocked();

  const balance = await getMyBalance(ctx.member.id, ctx.club.currencyCode);
  if (balance.balanceMinor <= 0n) {
    return { ok: false, reason: 'NO_BALANCE' };
  }

  // One pending claim at a time (FR-032 edge case).
  const pending = await db.query.payments.findFirst({
    where: and(eq(payments.memberId, ctx.member.id), eq(payments.status, 'claimed')),
  });
  if (pending) return { ok: false, reason: 'CLAIM_PENDING' };

  const profile = await db.query.clubBankingProfiles.findFirst({
    where: eq(clubBankingProfiles.clubId, ctx.club.id),
  });
  if (!profile?.iban) {
    return { ok: false, reason: 'BANKING_NOT_CONFIGURED' };
  }

  // Atomically allocate the next variable symbol.
  const [allocated] = await db
    .update(clubBankingProfiles)
    .set({ nextVariableSymbol: sql`${clubBankingProfiles.nextVariableSymbol} + 1` })
    .where(eq(clubBankingProfiles.clubId, ctx.club.id))
    .returning({ next: clubBankingProfiles.nextVariableSymbol });
  if (!allocated) throw new Error('initiateSettle: variable-symbol allocation failed');
  const variableSymbol = allocated.next - 1n;

  const messageText = `beeromat ${ctx.member.displayName}`;
  const spaydPayload = buildSpaydString({
    iban: profile.iban,
    amountMinor: balance.balanceMinor,
    currencyCode: ctx.club.currencyCode,
    variableSymbol,
    message: profile.defaultQrMessage ?? messageText,
  });
  const qrSvg = await renderQrSvg(spaydPayload);
  const revolutUrl = profile.revolutHandle
    ? buildRevolutUrl(profile.revolutHandle, balance.balanceMinor, ctx.club.currencyCode)
    : null;

  return {
    ok: true,
    settle: {
      amountMinor: balance.balanceMinor.toString(),
      currencyCode: ctx.club.currencyCode,
      variableSymbol: variableSymbol.toString(),
      spaydPayload,
      qrSvg,
      revolutUrl,
      messageText,
    },
  };
}

export type ClaimResult =
  | { ok: true; paymentId: string }
  | { ok: false; code: 'INVALID_AMOUNT' | 'CLAIM_PENDING' | 'NO_BALANCE' };

/**
 * Record a member-initiated payment claim (status `claimed`). Called
 * after the member completes the transfer in their banking app.
 */
export async function confirmTransferMadeAction(input: {
  variableSymbol: string;
  note?: string;
}): Promise<ClaimResult> {
  const ctx = await requireUnlocked();

  try {
    return await db.transaction(async (tx) => {
      const pending = await tx.query.payments.findFirst({
        where: and(eq(payments.memberId, ctx.member.id), eq(payments.status, 'claimed')),
      });
      if (pending) return { ok: false, code: 'CLAIM_PENDING' } as const;

      const balance = await getMyBalance(ctx.member.id, ctx.club.currencyCode);
      if (balance.balanceMinor <= 0n) return { ok: false, code: 'NO_BALANCE' } as const;

      const [payment] = await tx
        .insert(payments)
        .values({
          clubId: ctx.club.id,
          memberId: ctx.member.id,
          amountMinor: balance.balanceMinor,
          currencyCode: ctx.club.currencyCode,
          status: 'claimed',
          origin: 'member_initiated',
          variableSymbol: BigInt(input.variableSymbol),
          note: input.note ?? null,
          createdByUserId: ctx.user.id,
        })
        .returning();
      if (!payment) throw new Error('confirmTransferMade: payment insert failed');

      await tx.insert(paymentStateTransitions).values({
        clubId: ctx.club.id,
        paymentId: payment.id,
        fromStatus: null,
        toStatus: 'claimed',
        createdByUserId: ctx.user.id,
      });

      revalidatePath('/settle');
      revalidatePath('/');
      return { ok: true, paymentId: payment.id } as const;
    });
  } catch (e) {
    // Spec 027 — partial unique index uniq_payments_member_one_claimed
    // catches the check-then-insert race (two concurrent confirm calls
    // both pass the findFirst check, both try to insert). Translate
    // the constraint violation to the same user-facing code as the
    // in-tx check would have returned.
    if (isOneClaimedConstraintViolation(e)) {
      return { ok: false, code: 'CLAIM_PENDING' };
    }
    throw e;
  }
}

/**
 * Record a payment the member made out-of-band (cash, direct Revolut)
 * without going through the QR flow. Status `claimed`; note mandatory.
 */
export async function markPaidOtherMethodAction(input: {
  amountMinor: string;
  note: string;
}): Promise<ClaimResult> {
  const ctx = await requireUnlocked();
  const amountMinor = BigInt(input.amountMinor);
  if (amountMinor <= 0n || !input.note.trim()) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  try {
    return await db.transaction(async (tx) => {
      const pending = await tx.query.payments.findFirst({
        where: and(eq(payments.memberId, ctx.member.id), eq(payments.status, 'claimed')),
      });
      if (pending) return { ok: false, code: 'CLAIM_PENDING' } as const;

      const [payment] = await tx
        .insert(payments)
        .values({
          clubId: ctx.club.id,
          memberId: ctx.member.id,
          amountMinor,
          currencyCode: ctx.club.currencyCode,
          status: 'claimed',
          origin: 'member_initiated',
          note: input.note.trim(),
          createdByUserId: ctx.user.id,
        })
        .returning();
      if (!payment) throw new Error('markPaidOtherMethod: payment insert failed');

      await tx.insert(paymentStateTransitions).values({
        clubId: ctx.club.id,
        paymentId: payment.id,
        fromStatus: null,
        toStatus: 'claimed',
        createdByUserId: ctx.user.id,
      });

      revalidatePath('/settle');
      revalidatePath('/');
      return { ok: true, paymentId: payment.id } as const;
    });
  } catch (e) {
    if (isOneClaimedConstraintViolation(e)) {
      return { ok: false, code: 'CLAIM_PENDING' };
    }
    throw e;
  }
}

// Spec 027 — match Postgres unique-constraint violation on the new
// uniq_payments_member_one_claimed partial index. Drizzle wraps the
// underlying Postgres error in a DrizzleQueryError; the SQLSTATE +
// constraint name live on `.cause`. We also fall back to the
// top-level fields in case a future driver surfaces them directly.
// Match on the constraint name (not just SQLSTATE 23505) so we
// don't catch unrelated unique violations.
function isOneClaimedConstraintViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  type PgErrLike = { code?: string; constraint?: string; constraint_name?: string };
  const top = e as PgErrLike & { cause?: PgErrLike };
  const layers: PgErrLike[] = [top, top.cause ?? {}];
  for (const layer of layers) {
    if (layer.code !== '23505') continue;
    if (
      layer.constraint === 'uniq_payments_member_one_claimed' ||
      layer.constraint_name === 'uniq_payments_member_one_claimed'
    ) {
      return true;
    }
  }
  return false;
}
