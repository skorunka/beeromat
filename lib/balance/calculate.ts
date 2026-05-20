import 'server-only';
import { and, eq, notExists, sum } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { payments } from '@/lib/db/schema/payments';

// FR-024 / FR-031 — balance derivation.
//
// The effective consumption total of a member is:
//   their own consumptions (unvoided, not actively transferred away)
//   + consumptions actively transferred TO them (source unvoided).
// A bet transfer is "active" while it has no compensating
// bet_transfer_voids row. memberBalance then subtracts confirmed
// payments. This is the complete FR-024 picture.

/**
 * Sum of unvoided consumption prices effectively borne by a member,
 * optionally scoped to a single session. Applies bet transfers:
 * transferred-away consumptions drop off, transferred-in ones add on.
 * Returns 0n when the member has nothing.
 */
export async function effectiveConsumptionTotal(
  memberId: string,
  drinkSessionId?: string,
): Promise<bigint> {
  const sessionFilter = drinkSessionId
    ? eq(consumptions.drinkSessionId, drinkSessionId)
    : undefined;

  const [ownRows, transferredInRows] = await Promise.all([
    // Own consumptions, unvoided, not actively transferred away.
    db
      .select({ total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt) })
      .from(consumptions)
      .where(
        and(
          eq(consumptions.memberId, memberId),
          sessionFilter,
          notExists(
            db
              .select()
              .from(consumptionVoids)
              .where(eq(consumptionVoids.consumptionId, consumptions.id)),
          ),
          notExists(
            db
              .select()
              .from(betTransfers)
              .where(
                and(
                  eq(betTransfers.sourceConsumptionId, consumptions.id),
                  notExists(
                    db
                      .select()
                      .from(betTransferVoids)
                      .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
                  ),
                ),
              ),
          ),
        ),
      ),
    // Consumptions transferred TO the member by an active transfer.
    db
      .select({ total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt) })
      .from(betTransfers)
      .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
      .where(
        and(
          eq(betTransfers.toMemberId, memberId),
          sessionFilter,
          notExists(
            db
              .select()
              .from(betTransferVoids)
              .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
          ),
          notExists(
            db
              .select()
              .from(consumptionVoids)
              .where(eq(consumptionVoids.consumptionId, consumptions.id)),
          ),
        ),
      ),
  ]);

  return (ownRows[0]?.total ?? 0n) + (transferredInRows[0]?.total ?? 0n);
}

/**
 * Sum of a member's payments in a given status. `confirmed` payments
 * reduce the outstanding balance; `claimed` payments are shown as
 * "pending confirmation" but do NOT yet reduce the canonical balance.
 */
export async function paymentsTotal(
  memberId: string,
  status: 'claimed' | 'confirmed',
): Promise<bigint> {
  const result = await db
    .select({ total: sum(payments.amountMinor).mapWith(BigInt) })
    .from(payments)
    .where(and(eq(payments.memberId, memberId), eq(payments.status, status)));
  return result[0]?.total ?? 0n;
}

/**
 * Outstanding balance for a member across all sessions:
 *   effective consumption total − confirmed payments.
 * Claimed-but-unconfirmed payments are NOT subtracted here (see
 * getMyBalance for the "pending confirmation" presentation).
 */
export async function memberBalance(memberId: string): Promise<bigint> {
  const [consumed, confirmedPaid] = await Promise.all([
    effectiveConsumptionTotal(memberId),
    paymentsTotal(memberId, 'confirmed'),
  ]);
  return consumed - confirmedPaid;
}
