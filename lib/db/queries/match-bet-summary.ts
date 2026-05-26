import 'server-only';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matchBetTransfers } from '@/lib/db/schema/matches';

// Spec 018 — home-page lookup: for the active member in the
// active club, return the count of bet-linked unvoided
// consumptions from the past 24 hours, plus the source match ids.
// Folded into the home query path via Promise.all (FR-008,
// SC-005 of spec 017's pattern).
//
// 24h window keeps the home module from sticking around
// indefinitely; the audit trail on /tab + /admin views is
// untouched.

export interface MatchBetSummary {
  betCount: number;
  sourceMatchIds: string[];
}

export async function matchBetSummaryForMember(
  memberId: string,
  clubId: string,
): Promise<MatchBetSummary> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .selectDistinct({
      matchId: matchBetTransfers.matchId,
    })
    .from(betTransfers)
    .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
    .innerJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
    .where(
      and(
        eq(betTransfers.toMemberId, memberId),
        eq(betTransfers.clubId, clubId),
        isNull(consumptionVoids.consumptionId),
        isNull(betTransferVoids.betTransferId),
        gte(consumptions.createdAt, cutoff),
      ),
    );

  // Count of unvoided bet-linked consumptions in the window.
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(betTransfers)
    .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
    .innerJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
    .where(
      and(
        eq(betTransfers.toMemberId, memberId),
        eq(betTransfers.clubId, clubId),
        isNull(consumptionVoids.consumptionId),
        isNull(betTransferVoids.betTransferId),
        gte(consumptions.createdAt, cutoff),
      ),
    );

  return {
    betCount: countRow?.n ?? 0,
    sourceMatchIds: rows.map((r) => r.matchId),
  };
}
