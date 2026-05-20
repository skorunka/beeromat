import 'server-only';
import { and, eq, isNull, sum } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { payments } from '@/lib/db/schema/payments';

// FR-024 / FR-031 — balance derivation.
//
// As of US2 the calculator knows about consumptions, their voids, and
// confirmed payments. US6 will additionally apply bet_transfers to the
// effective consumption total. Signatures stay stable; only the SQL
// grows.

/**
 * Sum of unvoided consumption prices for a member, optionally scoped to
 * a single session. Returns 0n for members with no consumptions.
 */
export async function effectiveConsumptionTotal(
  memberId: string,
  drinkSessionId?: string,
): Promise<bigint> {
  const result = await db
    .select({ total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt) })
    .from(consumptions)
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(
      and(
        eq(consumptions.memberId, memberId),
        isNull(consumptionVoids.id),
        drinkSessionId ? eq(consumptions.drinkSessionId, drinkSessionId) : undefined,
      ),
    );

  return result[0]?.total ?? 0n;
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
  // TODO(US6): apply bet_transfers inside effectiveConsumptionTotal.
  const [consumed, confirmedPaid] = await Promise.all([
    effectiveConsumptionTotal(memberId),
    paymentsTotal(memberId, 'confirmed'),
  ]);
  return consumed - confirmedPaid;
}
