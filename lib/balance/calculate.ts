import 'server-only';
import { and, eq, isNull, sum } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';

// FR-024 / FR-031 — balance derivation.
//
// In US1 (this commit) the calculator only knows about consumptions and
// their voids. It will be extended in US6 (bet_transfers add to or
// subtract from the effective total) and US2 (confirmed payments
// subtract from the final balance). The signatures stay stable; only
// the SQL grows.

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
 * Outstanding balance for a member across all sessions.
 * Currently equals effectiveConsumptionTotal (no payments subtracted
 * yet — US2 adds the payments leg).
 */
export async function memberBalance(memberId: string): Promise<bigint> {
  // TODO(US2): subtract sum of confirmed payments.
  // TODO(US6): apply bet_transfers (add transfers-in, subtract
  //   transfers-out) inside effectiveConsumptionTotal.
  return effectiveConsumptionTotal(memberId);
}
