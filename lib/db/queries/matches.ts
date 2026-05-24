import 'server-only';
import { and, asc, desc, eq, isNull, notExists } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { matchBetTransfers, matches } from '@/lib/db/schema/matches';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';

// Spec 012 — match transaction helpers.
//
// logMatchTx: insert matches + (best-effort) N bet_transfer rows from
// winner → loser using winner's recent non-voided non-transferred
// consumptions in the current open session. Returns the inserted
// match + transferred count.
//
// voidMatchTx: soft-delete the match (set voidedAt / voidedByUserId /
// voidReason) AND insert bet_transfer_voids for every linked transfer
// that isn't already voided. Window-gating (5-min undo) is enforced
// at the action layer, not here.

export interface LogMatchResult {
  matchId: string;
  transferredCount: number;
  requestedCount: number;
}

export async function logMatchTx(args: {
  clubId: string;
  winnerMemberId: string;
  loserMemberId: string;
  createdByUserId: string;
  beerCount: number;
}): Promise<LogMatchResult> {
  return db.transaction(async (tx) => {
    const [matchRow] = await tx
      .insert(matches)
      .values({
        clubId: args.clubId,
        winnerMemberId: args.winnerMemberId,
        loserMemberId: args.loserMemberId,
        createdByUserId: args.createdByUserId,
      })
      .returning();
    if (!matchRow) throw new Error('logMatchTx: insert matches failed');

    // Best-effort transfer: find winner's non-voided non-transferred
    // consumptions in the club's current open session. Skip if no
    // session or no eligible consumptions (matches row still wins —
    // user can transfer manually via /bet later).
    //
    // Inline the session lookup against tx (NOT the outer db) so
    // PGlite doesn't deadlock against the still-open transaction.
    const [session] = await tx
      .select({ id: drinkSessions.id })
      .from(drinkSessions)
      .where(and(eq(drinkSessions.clubId, args.clubId), isNull(drinkSessions.endedAt)))
      .limit(1);
    if (!session) {
      return { matchId: matchRow.id, transferredCount: 0, requestedCount: args.beerCount };
    }

    const eligible = await tx
      .select({ id: consumptions.id })
      .from(consumptions)
      .where(
        and(
          eq(consumptions.drinkSessionId, session.id),
          eq(consumptions.memberId, args.winnerMemberId),
          notExists(
            tx
              .select()
              .from(consumptionVoids)
              .where(eq(consumptionVoids.consumptionId, consumptions.id)),
          ),
          notExists(
            tx
              .select()
              .from(betTransfers)
              .where(
                and(
                  eq(betTransfers.sourceConsumptionId, consumptions.id),
                  notExists(
                    tx
                      .select()
                      .from(betTransferVoids)
                      .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
                  ),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(consumptions.createdAt))
      .limit(args.beerCount);

    let transferredCount = 0;
    for (const c of eligible) {
      const [transfer] = await tx
        .insert(betTransfers)
        .values({
          clubId: args.clubId,
          sourceConsumptionId: c.id,
          fromMemberId: args.winnerMemberId,
          toMemberId: args.loserMemberId,
          createdByUserId: args.createdByUserId,
        })
        .returning();
      if (!transfer) continue;
      await tx
        .insert(matchBetTransfers)
        .values({ matchId: matchRow.id, betTransferId: transfer.id });
      transferredCount += 1;
    }

    return { matchId: matchRow.id, transferredCount, requestedCount: args.beerCount };
  });
}

export interface VoidMatchResult {
  voided: boolean;
  voidedTransferCount: number;
}

export async function voidMatchTx(args: {
  matchId: string;
  clubId: string;
  voidedByUserId: string;
  reason?: string;
}): Promise<VoidMatchResult> {
  return db.transaction(async (tx) => {
    const matchRow = await tx.query.matches.findFirst({
      where: and(eq(matches.id, args.matchId), eq(matches.clubId, args.clubId)),
    });
    if (!matchRow) return { voided: false, voidedTransferCount: 0 };
    if (matchRow.voidedAt) return { voided: false, voidedTransferCount: 0 };

    await tx
      .update(matches)
      .set({
        voidedAt: new Date(),
        voidedByUserId: args.voidedByUserId,
        voidReason: args.reason ?? null,
      })
      .where(eq(matches.id, args.matchId));

    // Void every linked transfer that isn't already voided.
    const links = await tx
      .select({ id: betTransfers.id })
      .from(matchBetTransfers)
      .innerJoin(betTransfers, eq(betTransfers.id, matchBetTransfers.betTransferId))
      .where(
        and(
          eq(matchBetTransfers.matchId, args.matchId),
          notExists(
            tx
              .select()
              .from(betTransferVoids)
              .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
          ),
        ),
      );

    let voidedTransferCount = 0;
    for (const link of links) {
      await tx.insert(betTransferVoids).values({
        clubId: args.clubId,
        betTransferId: link.id,
        voidedByUserId: args.voidedByUserId,
        reason: args.reason ?? null,
      });
      voidedTransferCount += 1;
    }

    return { voided: true, voidedTransferCount };
  });
}

export async function listOpponentsForMember(clubId: string, memberId: string) {
  return db
    .select({
      id: members.id,
      displayName: members.displayName,
    })
    .from(members)
    .where(
      and(
        eq(members.clubId, clubId),
        eq(members.isActive, true),
        // Exclude self.
        // Using a raw comparison rather than ne(members.id, memberId) for clarity.
      ),
    )
    .orderBy(asc(members.displayName))
    .then((rows) => rows.filter((r) => r.id !== memberId));
}
