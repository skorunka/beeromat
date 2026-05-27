import 'server-only';

import { and, desc, eq, gte, inArray, isNull, lte, sum } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { memberBalance, paymentsTotal } from '@/lib/balance/calculate';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';

export interface MemberBalanceView {
  /** Outstanding balance: confirmed consumption − confirmed payments. */
  balanceMinor: bigint;
  /** Sum of the member's claimed-but-not-yet-confirmed payments. */
  pendingConfirmationMinor: bigint;
  currencyCode: string;
}

/**
 * Balance summary for the member dashboard + settle screen
 * (contracts/payments.md → getMyBalance). `balanceMinor` is what the
 * member still owes; `pendingConfirmationMinor` is what they have
 * claimed to have paid but a treasurer hasn't confirmed yet.
 */
export async function getMyBalance(
  memberId: string,
  currencyCode: string,
): Promise<MemberBalanceView> {
  const [balanceMinor, pendingConfirmationMinor] = await Promise.all([
    memberBalance(memberId),
    paymentsTotal(memberId, 'claimed'),
  ]);
  return { balanceMinor, pendingConfirmationMinor, currencyCode };
}

export interface PendingClaim {
  paymentId: string;
  memberId: string;
  memberDisplayName: string;
  amountMinor: bigint;
  currencyCode: string;
  variableSymbol: bigint | null;
  note: string | null;
  createdAt: Date;
}

export interface PendingClaimFilters {
  from?: Date;
  to?: Date;
  memberId?: string;
  minAmountMinor?: bigint;
  maxAmountMinor?: bigint;
}

/**
 * Treasurer dashboard: the `claimed` payments awaiting confirmation,
 * newest first (contracts/payments.md → getPendingClaimsForTreasurer).
 */
export async function getPendingClaimsForTreasurer(
  clubId: string,
  filters: PendingClaimFilters = {},
): Promise<PendingClaim[]> {
  const rows = await db
    .select({
      paymentId: payments.id,
      memberId: payments.memberId,
      memberDisplayName: members.displayName,
      amountMinor: payments.amountMinor,
      currencyCode: payments.currencyCode,
      variableSymbol: payments.variableSymbol,
      note: payments.note,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(members, eq(members.id, payments.memberId))
    .where(
      and(
        eq(payments.clubId, clubId),
        eq(payments.status, 'claimed'),
        filters.from ? gte(payments.createdAt, filters.from) : undefined,
        filters.to ? lte(payments.createdAt, filters.to) : undefined,
        filters.memberId ? eq(payments.memberId, filters.memberId) : undefined,
        filters.minAmountMinor != null
          ? gte(payments.amountMinor, filters.minAmountMinor)
          : undefined,
        filters.maxAmountMinor != null
          ? lte(payments.amountMinor, filters.maxAmountMinor)
          : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt));
  return rows;
}

export interface MemberBalanceRow {
  memberId: string;
  displayName: string;
  avatarKey: string | null;
  isActive: boolean;
  balanceMinor: bigint;
  pendingConfirmationMinor: bigint;
}

/**
 * Treasurer's all-members balance overview, biggest debtors first
 * (contracts/payments.md → getAllMemberBalances). Computed with three
 * grouped aggregates rather than a per-member fan-out of queries.
 */
export async function getAllMemberBalances(clubId: string): Promise<MemberBalanceRow[]> {
  const [memberRows, consumptionTotals, paymentTotals] = await Promise.all([
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        avatarKey: members.avatarKey,
        isActive: members.isActive,
      })
      .from(members)
      .where(eq(members.clubId, clubId)),
    db
      .select({
        memberId: consumptions.memberId,
        total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt),
      })
      .from(consumptions)
      .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
      .where(and(eq(consumptions.clubId, clubId), isNull(consumptionVoids.id)))
      .groupBy(consumptions.memberId),
    db
      .select({
        memberId: payments.memberId,
        status: payments.status,
        total: sum(payments.amountMinor).mapWith(BigInt),
      })
      .from(payments)
      .where(eq(payments.clubId, clubId))
      .groupBy(payments.memberId, payments.status),
  ]);

  const consumedByMember = new Map(consumptionTotals.map((r) => [r.memberId, r.total ?? 0n]));
  const confirmedByMember = new Map<string, bigint>();
  const claimedByMember = new Map<string, bigint>();
  for (const row of paymentTotals) {
    if (row.status === 'confirmed') confirmedByMember.set(row.memberId, row.total ?? 0n);
    else if (row.status === 'claimed') claimedByMember.set(row.memberId, row.total ?? 0n);
  }

  return memberRows
    .map((m) => ({
      memberId: m.id,
      displayName: m.displayName,
      avatarKey: m.avatarKey,
      isActive: m.isActive,
      balanceMinor: (consumedByMember.get(m.id) ?? 0n) - (confirmedByMember.get(m.id) ?? 0n),
      pendingConfirmationMinor: claimedByMember.get(m.id) ?? 0n,
    }))
    .sort((a, b) => (b.balanceMinor > a.balanceMinor ? 1 : b.balanceMinor < a.balanceMinor ? -1 : 0));
}

export interface DisputedClaim {
  paymentId: string;
  amountMinor: bigint;
  currencyCode: string;
  reason: string | null;
  disputedAt: Date;
}

/**
 * Disputed payment claims for a member, with the treasurer's reason
 * pulled from the state-transition log. Drives the one-time dispute
 * banner shown on protected pages (FR-034 b).
 */
export async function getDisputedClaimsForMember(memberId: string): Promise<DisputedClaim[]> {
  const rows = await db
    .select({
      paymentId: payments.id,
      amountMinor: payments.amountMinor,
      currencyCode: payments.currencyCode,
      reason: paymentStateTransitions.reason,
      disputedAt: paymentStateTransitions.createdAt,
    })
    .from(payments)
    .innerJoin(
      paymentStateTransitions,
      and(
        eq(paymentStateTransitions.paymentId, payments.id),
        eq(paymentStateTransitions.toStatus, 'disputed'),
      ),
    )
    .where(and(eq(payments.memberId, memberId), eq(payments.status, 'disputed')))
    .orderBy(desc(paymentStateTransitions.createdAt));
  return rows;
}

export type PaymentHistoryStatus = 'claimed' | 'confirmed' | 'disputed' | 'voided';

export interface PaymentHistoryRow {
  paymentId: string;
  amountMinor: bigint;
  currencyCode: string;
  status: PaymentHistoryStatus;
  origin: 'member_initiated' | 'treasurer_initiated';
  /** When the member made (or the treasurer recorded) the payment. */
  createdAt: Date;
  /** When it reached its current state — for confirmed / disputed only. */
  resolvedAt: Date | null;
  /** The treasurer's reason — for a disputed payment only. */
  disputeReason: string | null;
}

/**
 * A member's own payment timeline, newest first
 * (contracts/payments.md → getPaymentHistory; the member-self variant).
 * Read-only: every payment the member has made, with its current state
 * and — for a confirmed/disputed payment — when it was resolved. Built
 * for the member payment-history screen (v1.3 UX review F20).
 */
export async function getPaymentHistory(
  memberId: string,
  clubId: string,
): Promise<PaymentHistoryRow[]> {
  const paymentRows = await db
    .select({
      paymentId: payments.id,
      amountMinor: payments.amountMinor,
      currencyCode: payments.currencyCode,
      status: payments.status,
      origin: payments.origin,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(eq(payments.memberId, memberId), eq(payments.clubId, clubId)))
    .orderBy(desc(payments.createdAt));

  if (paymentRows.length === 0) return [];

  // The transition into each payment's *current* status gives the
  // resolved-at timestamp and (for disputes) the reason. Newest first so
  // a `.find` below picks the most recent matching transition.
  const transitions = await db
    .select({
      paymentId: paymentStateTransitions.paymentId,
      toStatus: paymentStateTransitions.toStatus,
      reason: paymentStateTransitions.reason,
      createdAt: paymentStateTransitions.createdAt,
    })
    .from(paymentStateTransitions)
    .where(
      inArray(
        paymentStateTransitions.paymentId,
        paymentRows.map((p) => p.paymentId),
      ),
    )
    .orderBy(desc(paymentStateTransitions.createdAt));

  return paymentRows.map((p) => {
    // For any non-claimed status, the transition into that status gives
    // the resolved-at timestamp (and, for a dispute, the reason).
    const resolution =
      p.status === 'claimed'
        ? undefined
        : transitions.find((tr) => tr.paymentId === p.paymentId && tr.toStatus === p.status);
    return {
      paymentId: p.paymentId,
      amountMinor: p.amountMinor,
      currencyCode: p.currencyCode,
      status: p.status,
      origin: p.origin,
      createdAt: p.createdAt,
      resolvedAt: resolution?.createdAt ?? null,
      disputeReason: p.status === 'disputed' ? (resolution?.reason ?? null) : null,
    };
  });
}

export interface ConfirmedPaymentRow {
  paymentId: string;
  memberDisplayName: string;
  amountMinor: bigint;
  currencyCode: string;
  confirmedAt: Date;
}

/**
 * Recently confirmed payments for the treasurer view (US4) — newest
 * confirmation first. Ordered by the `confirmed` state-transition so a
 * treasurer can find and undo a mistaken confirmation.
 */
export async function getRecentlyConfirmedPayments(
  clubId: string,
  limit = 20,
): Promise<ConfirmedPaymentRow[]> {
  const rows = await db
    .select({
      paymentId: payments.id,
      memberDisplayName: members.displayName,
      amountMinor: payments.amountMinor,
      currencyCode: payments.currencyCode,
      confirmedAt: paymentStateTransitions.createdAt,
    })
    .from(payments)
    .innerJoin(members, eq(members.id, payments.memberId))
    .innerJoin(
      paymentStateTransitions,
      and(
        eq(paymentStateTransitions.paymentId, payments.id),
        eq(paymentStateTransitions.toStatus, 'confirmed'),
      ),
    )
    .where(and(eq(payments.clubId, clubId), eq(payments.status, 'confirmed')))
    .orderBy(desc(paymentStateTransitions.createdAt))
    .limit(limit);
  return rows;
}
