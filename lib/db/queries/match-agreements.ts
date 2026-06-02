import 'server-only';
import { and, asc, desc, eq, isNull, notExists, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import {
  matchAgreementSides,
  matchAgreements,
  matchBetTransfers,
  matches,
} from '@/lib/db/schema/matches';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';

// Spec 018 — match-bet → home awareness. settleOnePair rewritten
// to auto-create the winner's consumption + bet_transfer (rather
// than passively searching for an existing consumption). Helpers
// imported below.
import { splitBeerCountAcrossPairs } from '@/lib/match/split-beer-count';
import { pickBetBeer, NoBeerInStockError, type BetBeerCandidate } from '@/lib/match/default-bet-beer';
import { lastBeerForMember } from '@/lib/db/queries/consumption';

// Spec 013 — match-agreement transaction helpers.
//
// createAgreementTx — insert one match_agreements row + 2 or 4 sides rows.
// recordResultTx    — insert N matches rows (1 singles, 2 doubles paired),
//                     run per-pair best-effort bet-transfer settlement if
//                     for_beer = true, stamp the agreement (optimistic
//                     concurrency on result_recorded_at IS NULL).
// reverseResultTx   — soft-void all linked matches rows + their transfers;
//                     stamp reversed_at + null result_recorded_at to return
//                     the agreement to OPEN per US1.3.
//
// editAgreementTx + cancelAgreementTx live in this module too (US4).

type Side = 'A' | 'B';
type Seat = 1 | 2;
type PairingKind = 'straight' | 'crossed';

interface AgreementSideInput {
  seat1: string;
  seat2?: string;
}

interface AgreementSidesInput {
  A: AgreementSideInput;
  B: AgreementSideInput;
}

type AgreementInputCommon = {
  forBeer: boolean;
  sides: AgreementSidesInput;
};

export type CreateAgreementInput =
  | (AgreementInputCommon & { format: 'singles'; pairingKind?: undefined })
  | (AgreementInputCommon & { format: 'doubles'; pairingKind: PairingKind });

export interface CreateAgreementArgs {
  clubId: string;
  createdByUserId: string;
  input: CreateAgreementInput;
}

export type CreateAgreementResult =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' }
  | { ok: false; code: 'DUPLICATE_MEMBER' };

async function assertAllMembersInClub(
  tx: typeof db,
  clubId: string,
  memberIds: string[],
): Promise<boolean> {
  if (memberIds.length === 0) return true;
  const rows = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.clubId, clubId)));
  const clubMemberIds = new Set(rows.map((r) => r.id));
  return memberIds.every((id) => clubMemberIds.has(id));
}

function flattenSides(
  input: CreateAgreementInput,
): { side: Side; seat: Seat; memberId: string }[] {
  const out: { side: Side; seat: Seat; memberId: string }[] = [
    { side: 'A', seat: 1, memberId: input.sides.A.seat1 },
    { side: 'B', seat: 1, memberId: input.sides.B.seat1 },
  ];
  if (input.format === 'doubles') {
    out.push(
      { side: 'A', seat: 2, memberId: input.sides.A.seat2! },
      { side: 'B', seat: 2, memberId: input.sides.B.seat2! },
    );
  }
  return out;
}

export async function createAgreementTx(
  args: CreateAgreementArgs,
): Promise<CreateAgreementResult> {
  const sides = flattenSides(args.input);
  const memberIds = sides.map((s) => s.memberId);
  const uniq = new Set(memberIds);
  if (uniq.size !== memberIds.length) {
    return { ok: false, code: 'DUPLICATE_MEMBER' };
  }

  return db.transaction(async (tx) => {
    const allInClub = await assertAllMembersInClub(tx as typeof db, args.clubId, memberIds);
    if (!allInClub) return { ok: false, code: 'MEMBER_NOT_IN_CLUB' };

    const [agreement] = await tx
      .insert(matchAgreements)
      .values({
        clubId: args.clubId,
        format: args.input.format,
        forBeer: args.input.forBeer,
        pairingKind: args.input.format === 'doubles' ? args.input.pairingKind : null,
        createdByUserId: args.createdByUserId,
      })
      .returning();
    if (!agreement) throw new Error('createAgreementTx: insert agreement failed');

    await tx
      .insert(matchAgreementSides)
      .values(sides.map((s) => ({ agreementId: agreement.id, ...s })));

    return { ok: true, agreementId: agreement.id };
  });
}

// Computes the per-pair (winner, loser) tuples produced by a recorded result.
// Singles: 1 tuple. Doubles: 2 tuples (paired per pairingKind).
interface SettlementPair {
  winnerMemberId: string;
  loserMemberId: string;
}

function computePairs(
  format: 'singles' | 'doubles',
  pairingKind: PairingKind | null,
  winningSide: Side,
  sideRows: { side: Side; seat: Seat; memberId: string }[],
): SettlementPair[] {
  const a1 = sideRows.find((r) => r.side === 'A' && r.seat === 1)!.memberId;
  const b1 = sideRows.find((r) => r.side === 'B' && r.seat === 1)!.memberId;
  if (format === 'singles') {
    return winningSide === 'A'
      ? [{ winnerMemberId: a1, loserMemberId: b1 }]
      : [{ winnerMemberId: b1, loserMemberId: a1 }];
  }
  const a2 = sideRows.find((r) => r.side === 'A' && r.seat === 2)!.memberId;
  const b2 = sideRows.find((r) => r.side === 'B' && r.seat === 2)!.memberId;
  // Pairing: straight → A1↔B1, A2↔B2; crossed → A1↔B2, A2↔B1.
  const pairs: [string, string][] =
    pairingKind === 'straight'
      ? [
          [a1, b1],
          [a2, b2],
        ]
      : [
          [a1, b2],
          [a2, b1],
        ];
  return pairs.map(([aSeat, bSeat]) =>
    winningSide === 'A'
      ? { winnerMemberId: aSeat, loserMemberId: bSeat }
      : { winnerMemberId: bSeat, loserMemberId: aSeat },
  );
}

// Per-pair best-effort settlement: try to transfer up to `beerCount` of the
// winner's recent eligible consumptions to the loser via bet_transfers,
// linked through match_bet_transfers. Mirrors the 012 logMatchTx pipeline,
// inlined here so 013 doesn't depend on its survival once US2 removes the
// legacy 012 quick-log path.
// Spec 018 — auto-create winner consumption + bet_transfer + link.
// Replaces the spec-013 "find an existing winner consumption and
// transfer it" path. Always settles exactly `beerCount` beers per
// call; the caller has pre-resolved the beer + price + session.
async function settleOnePair(
  tx: typeof db,
  args: {
    clubId: string;
    matchId: string;
    sessionId: string;
    winnerMemberId: string;
    loserMemberId: string;
    createdByUserId: string;
    beerCount: number;
    beerTypeId: string;
    beerUnitPriceMinor: bigint;
  },
): Promise<{ transferredCount: number; requestedCount: number }> {
  let transferredCount = 0;
  for (let j = 0; j < args.beerCount; j += 1) {
    // 1. Decrement stock FIRST, guarded by `currentStock > 0` (the
    //    same atomic guard logBeer uses). When the chosen beer runs
    //    out mid-settlement we STOP — best-effort partial settlement
    //    (the result's transferredCount < requestedCount and the
    //    recordedPartial UI copy already expect this). Without the
    //    guard the decrement would hit the beer_types_stock_non_negative
    //    CHECK constraint and throw an uncaught 23514, rolling back the
    //    whole match record — a valid for-beer match would 500 whenever
    //    the loser owed more beers than the beer's stock.
    const decremented = await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} - 1` })
      .where(and(eq(beerTypes.id, args.beerTypeId), sql`${beerTypes.currentStock} > 0`))
      .returning({ currentStock: beerTypes.currentStock });
    if (decremented.length === 0) break; // out of stock — settle what we could

    await tx.insert(stockChanges).values({
      clubId: args.clubId,
      beerTypeId: args.beerTypeId,
      delta: -1,
      kind: 'consumption_decrement',
      createdByUserId: args.createdByUserId,
    });

    // 2. Insert the winner's consumption row.
    const [consumption] = await tx
      .insert(consumptions)
      .values({
        clubId: args.clubId,
        drinkSessionId: args.sessionId,
        memberId: args.winnerMemberId,
        beerTypeId: args.beerTypeId,
        unitPriceMinorSnapshot: args.beerUnitPriceMinor,
        createdByUserId: args.createdByUserId,
      })
      .returning();
    if (!consumption) throw new Error('settleOnePair: insert consumption failed');

    // 3. Bet transfer (winner → loser).
    const [transfer] = await tx
      .insert(betTransfers)
      .values({
        clubId: args.clubId,
        sourceConsumptionId: consumption.id,
        fromMemberId: args.winnerMemberId,
        toMemberId: args.loserMemberId,
        createdByUserId: args.createdByUserId,
      })
      .returning();
    if (!transfer) throw new Error('settleOnePair: insert bet_transfer failed');

    // 4. Match link.
    await tx
      .insert(matchBetTransfers)
      .values({ matchId: args.matchId, betTransferId: transfer.id });

    transferredCount += 1;
  }

  return { transferredCount, requestedCount: args.beerCount };
}

export interface RecordResultArgs {
  agreementId: string;
  clubId: string;
  recordedByUserId: string;
  winningSide: Side;
  // Spec 018 — optional override beer for the auto-created winner
  // consumption(s). When omitted, the resolver picks the
  // recording-pair's winner's last-beer (or cheapest in-stock as
  // fallback). Validated by the caller before reaching here.
  betBeerOverrideId?: string;
}

export type RecordResultResult =
  | {
      ok: true;
      matchRowIds: string[];
      transferredCount: number;
      requestedCount: number;
      // Spec 018 — which beer type backed the bet (null when the
      // agreement is not for-beer; otherwise the resolved choice).
      betBeerTypeId: string | null;
    }
  | { ok: false; code: 'NOT_FOUND' }
  | {
      ok: false;
      code: 'ALREADY_RECORDED';
      recordedAt: Date;
      recordedByUserId: string | null;
    }
  | { ok: false; code: 'CANCELLED' }
  | { ok: false; code: 'NO_BEER_IN_STOCK' };

// Spec 027 perf — sentinel thrown when the optimistic-lock UPDATE
// inside recordResultTx returns 0 rows (another caller already
// stamped resultRecordedAt). The throw is needed to roll back the
// transaction's already-completed inserts (matches + consumptions +
// stock_changes + bet_transfers); the outer try/catch converts it
// to a user-friendly ALREADY_RECORDED result so a double-submit
// during network stall produces a clean error toast instead of a
// 500. Custom class keeps the matching specific (no error-string
// sniffing).
class LostConcurrencyRaceError extends Error {
  constructor() {
    super('recordResultTx: lost concurrency race');
    this.name = 'LostConcurrencyRaceError';
  }
}

export async function recordResultTx(args: RecordResultArgs): Promise<RecordResultResult> {
  try {
    return await db.transaction(async (tx) => {
      const agreement = await tx.query.matchAgreements.findFirst({
        where: and(eq(matchAgreements.id, args.agreementId), eq(matchAgreements.clubId, args.clubId)),
      });
      if (!agreement) return { ok: false, code: 'NOT_FOUND' as const };
      if (agreement.cancelledAt) return { ok: false, code: 'CANCELLED' as const };
      if (agreement.resultRecordedAt) {
        return {
          ok: false,
          code: 'ALREADY_RECORDED' as const,
          recordedAt: agreement.resultRecordedAt,
          recordedByUserId: agreement.resultRecordedByUserId,
        };
      }

      const sideRows = await tx
        .select({
          side: matchAgreementSides.side,
          seat: matchAgreementSides.seat,
          memberId: matchAgreementSides.memberId,
        })
        .from(matchAgreementSides)
        .where(eq(matchAgreementSides.agreementId, args.agreementId));

      const pairs = computePairs(
        agreement.format,
        agreement.pairingKind as PairingKind | null,
        args.winningSide,
        sideRows.map((r) => ({ side: r.side as Side, seat: r.seat as Seat, memberId: r.memberId })),
      );

      // Spec 018 — for-beer matches need the doubles-split + beer
      // resolution computed once for the whole transaction.
      let perPairBeerCount: number[] = pairs.map(() => 0);
      let resolvedBeer: BetBeerCandidate | null = null;
      let sessionId: string | null = null;

      if (agreement.forBeer) {
        // 1. Load club config (matchLoserBeerCount). Today this is
        //    default 1 in the schema; spec 018 turns it from a dead
        //    column into the source of truth.
        const club = await tx.query.clubs.findFirst({
          where: eq(clubs.id, args.clubId),
        });
        if (!club) throw new Error('recordResultTx: club not found');

        // 2. Split the per-side total across the pairs.
        perPairBeerCount = splitBeerCountAcrossPairs(club.matchLoserBeerCount, pairs.length);

        // 3. Resolve the default beer ONCE for the whole match.
        //    Use the first pair's winner as the "winner" for the
        //    last-beer lookup. (Doubles can have two different
        //    winners across pairs — picking the first is arbitrary but
        //    deterministic; the override can correct it.)
        const firstWinner = pairs[0]?.winnerMemberId;
        if (!firstWinner) throw new Error('recordResultTx: no pairs to settle');

        const lastBeer = await lastBeerForMember(firstWinner, args.clubId, tx as typeof db);
        const catalog = await tx
          .select({
            id: beerTypes.id,
            name: beerTypes.name,
            currentStock: beerTypes.currentStock,
            isArchived: beerTypes.isArchived,
            unitPriceMinor: beerTypes.unitPriceMinor,
          })
          .from(beerTypes)
          .where(eq(beerTypes.clubId, args.clubId));

        resolvedBeer = pickBetBeer({
          override: args.betBeerOverrideId,
          lastBeer,
          catalog,
        });

        // 4. Find-or-auto-open the drink session. Race-safe via
        //    onConflictDoNothing + re-select against the partial unique
        //    index uniq_drink_sessions_club_open (see logBeer note).
        const [openSession] = await tx
          .select({ id: drinkSessions.id })
          .from(drinkSessions)
          .where(and(eq(drinkSessions.clubId, args.clubId), isNull(drinkSessions.endedAt)))
          .limit(1);
        if (openSession) {
          sessionId = openSession.id;
        } else {
          await tx
            .insert(drinkSessions)
            .values({
              clubId: args.clubId,
              openedByUserId: args.recordedByUserId,
              startedAt: new Date(),
            })
            .onConflictDoNothing();
          const [reselected] = await tx
            .select({ id: drinkSessions.id })
            .from(drinkSessions)
            .where(and(eq(drinkSessions.clubId, args.clubId), isNull(drinkSessions.endedAt)))
            .limit(1);
          if (!reselected) throw new Error('recordResultTx: failed to auto-open session');
          sessionId = reselected.id;
        }
      }

      const matchRowIds: string[] = [];
      let transferredCount = 0;
      let requestedCount = 0;

      for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i]!;
        const [matchRow] = await tx
          .insert(matches)
          .values({
            clubId: args.clubId,
            winnerMemberId: pair.winnerMemberId,
            loserMemberId: pair.loserMemberId,
            agreementId: args.agreementId,
            createdByUserId: args.recordedByUserId,
          })
          .returning();
        if (!matchRow) throw new Error('recordResultTx: insert matches failed');
        matchRowIds.push(matchRow.id);

        const beerCountForPair = perPairBeerCount[i] ?? 0;
        if (agreement.forBeer && beerCountForPair > 0 && resolvedBeer && sessionId) {
          const settled = await settleOnePair(tx as typeof db, {
            clubId: args.clubId,
            matchId: matchRow.id,
            sessionId,
            winnerMemberId: pair.winnerMemberId,
            loserMemberId: pair.loserMemberId,
            createdByUserId: args.recordedByUserId,
            beerCount: beerCountForPair,
            beerTypeId: resolvedBeer.id,
            beerUnitPriceMinor: resolvedBeer.unitPriceMinor,
          });
          transferredCount += settled.transferredCount;
          requestedCount += settled.requestedCount;
        }
      }

      // Optimistic-concurrency stamp: only succeeds if the agreement
      // is still in OPEN state.
      const updated = await tx
        .update(matchAgreements)
        .set({
          winningSide: args.winningSide,
          resultRecordedAt: new Date(),
          resultRecordedByUserId: args.recordedByUserId,
        })
        .where(
          and(
            eq(matchAgreements.id, args.agreementId),
            isNull(matchAgreements.resultRecordedAt),
            isNull(matchAgreements.cancelledAt),
          ),
        )
        .returning({ id: matchAgreements.id });
      if (updated.length === 0) {
        throw new LostConcurrencyRaceError();
      }

      return {
        ok: true as const,
        matchRowIds,
        transferredCount,
        requestedCount,
        betBeerTypeId: resolvedBeer?.id ?? null,
      };
    });
  } catch (e) {
    if (e instanceof NoBeerInStockError) {
      return { ok: false, code: 'NO_BEER_IN_STOCK' };
    }
    if (e instanceof LostConcurrencyRaceError) {
      // Re-read post-rollback to surface the canonical recorded-at
      // for the user-facing toast. The winner has already committed,
      // so this select returns the populated values.
      const winner = await db.query.matchAgreements.findFirst({
        where: and(
          eq(matchAgreements.id, args.agreementId),
          eq(matchAgreements.clubId, args.clubId),
        ),
      });
      return {
        ok: false,
        code: 'ALREADY_RECORDED',
        recordedAt: winner?.resultRecordedAt ?? new Date(),
        recordedByUserId: winner?.resultRecordedByUserId ?? null,
      };
    }
    throw e;
  }
}

export interface ReverseResultArgs {
  agreementId: string;
  clubId: string;
  reversedByUserId: string;
}

export type ReverseResultResult =
  | { ok: true; voidedMatchCount: number; voidedTransferCount: number }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_RECORDED' }
  | { ok: false; code: 'UNDO_WINDOW_EXPIRED' };

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export async function reverseResultTx(args: ReverseResultArgs): Promise<ReverseResultResult> {
  return db.transaction(async (tx) => {
    const agreement = await tx.query.matchAgreements.findFirst({
      where: and(eq(matchAgreements.id, args.agreementId), eq(matchAgreements.clubId, args.clubId)),
    });
    if (!agreement) return { ok: false, code: 'NOT_FOUND' };
    if (!agreement.resultRecordedAt) return { ok: false, code: 'NOT_RECORDED' };
    if (Date.now() - agreement.resultRecordedAt.getTime() > UNDO_WINDOW_MS) {
      return { ok: false, code: 'UNDO_WINDOW_EXPIRED' };
    }

    // Find all matches rows produced by this agreement that aren't already
    // voided. There may be 1 (singles) or 2 (doubles).
    const linkedMatches = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.agreementId, args.agreementId), isNull(matches.voidedAt)));

    let voidedTransferCount = 0;
    for (const m of linkedMatches) {
      await tx
        .update(matches)
        .set({
          voidedAt: new Date(),
          voidedByUserId: args.reversedByUserId,
          voidReason: 'agreement reversal',
        })
        .where(eq(matches.id, m.id));

      // Spec 018 — pull both the transfer id AND its source
      // consumption so the cascade can void both atomically and
      // restore the winner's stock.
      const links = await tx
        .select({
          transferId: betTransfers.id,
          sourceConsumptionId: betTransfers.sourceConsumptionId,
          beerTypeId: consumptions.beerTypeId,
        })
        .from(matchBetTransfers)
        .innerJoin(betTransfers, eq(betTransfers.id, matchBetTransfers.betTransferId))
        .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
        .where(
          and(
            eq(matchBetTransfers.matchId, m.id),
            notExists(
              tx
                .select()
                .from(betTransferVoids)
                .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
            ),
          ),
        );
      for (const link of links) {
        // 1. Void the transfer.
        await tx.insert(betTransferVoids).values({
          clubId: args.clubId,
          betTransferId: link.transferId,
          voidedByUserId: args.reversedByUserId,
          reason: 'agreement reversal',
        });
        voidedTransferCount += 1;

        // 2. Spec 018 cascade: void the source consumption (which
        //    this spec auto-created during settlement). Skip if
        //    already voided directly by a member's undo path.
        const existingConsumptionVoid = await tx.query.consumptionVoids.findFirst({
          where: eq(consumptionVoids.consumptionId, link.sourceConsumptionId),
        });
        if (!existingConsumptionVoid) {
          await tx.insert(consumptionVoids).values({
            clubId: args.clubId,
            consumptionId: link.sourceConsumptionId,
            voidedByUserId: args.reversedByUserId,
            reason: 'agreement reversal',
          });
          // 3. Restore stock + audit row (mirrors voidConsumptionAction).
          await tx
            .update(beerTypes)
            .set({ currentStock: sql`${beerTypes.currentStock} + 1` })
            .where(eq(beerTypes.id, link.beerTypeId));
          await tx.insert(stockChanges).values({
            clubId: args.clubId,
            beerTypeId: link.beerTypeId,
            delta: 1,
            kind: 'consumption_void_increment',
            createdByUserId: args.reversedByUserId,
          });
        }
      }
    }

    // Soft-state restoration: agreement returns to OPEN; reversed_at carries
    // the audit trail. See plan.md Phase-1 re-evaluation note + constitution V
    // interpretation.
    await tx
      .update(matchAgreements)
      .set({
        resultRecordedAt: null,
        resultRecordedByUserId: null,
        winningSide: null,
        reversedAt: new Date(),
        reversedByUserId: args.reversedByUserId,
      })
      .where(eq(matchAgreements.id, args.agreementId));

    return { ok: true, voidedMatchCount: linkedMatches.length, voidedTransferCount };
  });
}

// US4 — edit + cancel helpers.

export interface EditAgreementArgs {
  agreementId: string;
  clubId: string;
  input: CreateAgreementInput;
}

export type EditAgreementResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_EDITABLE' }
  | { ok: false; code: 'DUPLICATE_MEMBER' }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' };

export async function editAgreementTx(args: EditAgreementArgs): Promise<EditAgreementResult> {
  const sides = flattenSides(args.input);
  const memberIds = sides.map((s) => s.memberId);
  const uniq = new Set(memberIds);
  if (uniq.size !== memberIds.length) return { ok: false, code: 'DUPLICATE_MEMBER' };

  return db.transaction(async (tx) => {
    const agreement = await tx.query.matchAgreements.findFirst({
      where: and(eq(matchAgreements.id, args.agreementId), eq(matchAgreements.clubId, args.clubId)),
    });
    if (!agreement) return { ok: false, code: 'NOT_FOUND' };
    if (agreement.resultRecordedAt || agreement.cancelledAt) {
      return { ok: false, code: 'NOT_EDITABLE' };
    }

    const allInClub = await assertAllMembersInClub(tx as typeof db, args.clubId, memberIds);
    if (!allInClub) return { ok: false, code: 'MEMBER_NOT_IN_CLUB' };

    await tx
      .update(matchAgreements)
      .set({
        format: args.input.format,
        forBeer: args.input.forBeer,
        pairingKind: args.input.format === 'doubles' ? args.input.pairingKind : null,
      })
      .where(eq(matchAgreements.id, args.agreementId));

    await tx.delete(matchAgreementSides).where(eq(matchAgreementSides.agreementId, args.agreementId));
    await tx
      .insert(matchAgreementSides)
      .values(sides.map((s) => ({ agreementId: args.agreementId, ...s })));

    return { ok: true };
  });
}

export interface CancelAgreementArgs {
  agreementId: string;
  clubId: string;
  cancelledByUserId: string;
}

export type CancelAgreementResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_CANCELLABLE' };

export async function cancelAgreementTx(
  args: CancelAgreementArgs,
): Promise<CancelAgreementResult> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(matchAgreements)
      .set({
        cancelledAt: new Date(),
        cancelledByUserId: args.cancelledByUserId,
      })
      .where(
        and(
          eq(matchAgreements.id, args.agreementId),
          eq(matchAgreements.clubId, args.clubId),
          isNull(matchAgreements.resultRecordedAt),
          isNull(matchAgreements.cancelledAt),
          // A reversed agreement (recorded then undone) carries reversed_at
          // as its audit trail; the chk_match_agreements_cancel_xor_result
          // constraint forbids cancelling it. Guard here so the action
          // returns NOT_CANCELLABLE instead of letting the DB 500.
          isNull(matchAgreements.reversedAt),
        ),
      )
      .returning({ id: matchAgreements.id });
    if (updated.length === 0) {
      const exists = await tx.query.matchAgreements.findFirst({
        where: and(
          eq(matchAgreements.id, args.agreementId),
          eq(matchAgreements.clubId, args.clubId),
        ),
      });
      if (!exists) return { ok: false, code: 'NOT_FOUND' };
      return { ok: false, code: 'NOT_CANCELLABLE' };
    }
    return { ok: true };
  });
}

// Read-side helpers — power /match hub and the agreement detail page.

export interface OpenAgreementSummary {
  id: string;
  format: 'singles' | 'doubles';
  forBeer: boolean;
  pairingKind: PairingKind | null;
  createdAt: Date;
  sides: {
    A: { memberId: string; displayName: string; seat: Seat }[];
    B: { memberId: string; displayName: string; seat: Seat }[];
  };
}

/**
 * Open agreements the given member is an actual participant in.
 * Drives the home "match to record" prompt — a treasurer's home
 * isn't cluttered with every open club match they're not playing in.
 * Same shape as listOpenAgreements, just filtered to the member.
 */
export async function listOpenAgreementsForMember(
  clubId: string,
  memberId: string,
): Promise<OpenAgreementSummary[]> {
  const all = await listOpenAgreements(clubId);
  return all.filter((a) =>
    [...a.sides.A, ...a.sides.B].some((s) => s.memberId === memberId),
  );
}

/**
 * Spec 027 — the member's most-recently-created match agreement they
 * were a participant in, in any state (open / recorded / cancelled),
 * club-scoped. Drives the /match "Recreate last match" control: we
 * clone the LINEUP, so the prior result is irrelevant — any state is
 * a valid template. Returns null when the member has never played.
 *
 * Note: reuses the OpenAgreementSummary shape even though the source
 * may be recorded/cancelled — only the lineup/format/forBeer/pairing
 * fields are consumed by the recreate flow.
 */
export async function lastAgreementForMember(
  clubId: string,
  memberId: string,
): Promise<OpenAgreementSummary | null> {
  // 1. Newest agreement (any state) this member appears in. A member
  //    occupies at most one seat per agreement (duplicate-member is
  //    blocked at create), so the join yields one row per agreement.
  const [latest] = await db
    .select({ id: matchAgreements.id })
    .from(matchAgreements)
    .innerJoin(
      matchAgreementSides,
      eq(matchAgreementSides.agreementId, matchAgreements.id),
    )
    .where(
      and(eq(matchAgreements.clubId, clubId), eq(matchAgreementSides.memberId, memberId)),
    )
    .orderBy(desc(matchAgreements.createdAt))
    .limit(1);
  if (!latest) return null;

  // 2. Full lineup for that agreement (all seats, not just the
  //    member's), assembled into the OpenAgreementSummary shape.
  const rows = await db
    .select({
      id: matchAgreements.id,
      format: matchAgreements.format,
      forBeer: matchAgreements.forBeer,
      pairingKind: matchAgreements.pairingKind,
      createdAt: matchAgreements.createdAt,
      side: matchAgreementSides.side,
      seat: matchAgreementSides.seat,
      memberId: members.id,
      displayName: members.displayName,
    })
    .from(matchAgreements)
    .innerJoin(matchAgreementSides, eq(matchAgreementSides.agreementId, matchAgreements.id))
    .innerJoin(members, eq(members.id, matchAgreementSides.memberId))
    .where(eq(matchAgreements.id, latest.id))
    .orderBy(asc(matchAgreementSides.side), asc(matchAgreementSides.seat));

  if (rows.length === 0) return null;
  const first = rows[0]!;
  const summary: OpenAgreementSummary = {
    id: first.id,
    format: first.format,
    forBeer: first.forBeer,
    pairingKind: first.pairingKind as PairingKind | null,
    createdAt: first.createdAt,
    sides: { A: [], B: [] },
  };
  for (const r of rows) {
    summary.sides[r.side as Side].push({
      memberId: r.memberId,
      displayName: r.displayName,
      seat: r.seat as Seat,
    });
  }
  return summary;
}

export async function listOpenAgreements(clubId: string): Promise<OpenAgreementSummary[]> {
  const rows = await db
    .select({
      id: matchAgreements.id,
      format: matchAgreements.format,
      forBeer: matchAgreements.forBeer,
      pairingKind: matchAgreements.pairingKind,
      createdAt: matchAgreements.createdAt,
      side: matchAgreementSides.side,
      seat: matchAgreementSides.seat,
      memberId: members.id,
      displayName: members.displayName,
    })
    .from(matchAgreements)
    .innerJoin(matchAgreementSides, eq(matchAgreementSides.agreementId, matchAgreements.id))
    .innerJoin(members, eq(members.id, matchAgreementSides.memberId))
    .where(
      and(
        eq(matchAgreements.clubId, clubId),
        isNull(matchAgreements.resultRecordedAt),
        isNull(matchAgreements.cancelledAt),
      ),
    )
    .orderBy(desc(matchAgreements.createdAt), asc(matchAgreementSides.side), asc(matchAgreementSides.seat));

  const byAgreement = new Map<string, OpenAgreementSummary>();
  for (const r of rows) {
    let agg = byAgreement.get(r.id);
    if (!agg) {
      agg = {
        id: r.id,
        format: r.format,
        forBeer: r.forBeer,
        pairingKind: r.pairingKind as PairingKind | null,
        createdAt: r.createdAt,
        sides: { A: [], B: [] },
      };
      byAgreement.set(r.id, agg);
    }
    agg.sides[r.side as Side].push({
      memberId: r.memberId,
      displayName: r.displayName,
      seat: r.seat as Seat,
    });
  }
  return Array.from(byAgreement.values());
}

export interface AgreementDetail extends OpenAgreementSummary {
  winningSide: Side | null;
  resultRecordedAt: Date | null;
  resultRecordedByUserId: string | null;
  reversedAt: Date | null;
  cancelledAt: Date | null;
  participantMemberIds: string[];
}

export async function getAgreement(
  agreementId: string,
  clubId: string,
): Promise<AgreementDetail | null> {
  const rows = await db
    .select({
      id: matchAgreements.id,
      format: matchAgreements.format,
      forBeer: matchAgreements.forBeer,
      pairingKind: matchAgreements.pairingKind,
      createdAt: matchAgreements.createdAt,
      winningSide: matchAgreements.winningSide,
      resultRecordedAt: matchAgreements.resultRecordedAt,
      resultRecordedByUserId: matchAgreements.resultRecordedByUserId,
      reversedAt: matchAgreements.reversedAt,
      cancelledAt: matchAgreements.cancelledAt,
      side: matchAgreementSides.side,
      seat: matchAgreementSides.seat,
      memberId: members.id,
      displayName: members.displayName,
    })
    .from(matchAgreements)
    .innerJoin(matchAgreementSides, eq(matchAgreementSides.agreementId, matchAgreements.id))
    .innerJoin(members, eq(members.id, matchAgreementSides.memberId))
    .where(and(eq(matchAgreements.id, agreementId), eq(matchAgreements.clubId, clubId)))
    .orderBy(asc(matchAgreementSides.side), asc(matchAgreementSides.seat));

  if (rows.length === 0) return null;

  const first = rows[0]!;
  const detail: AgreementDetail = {
    id: first.id,
    format: first.format,
    forBeer: first.forBeer,
    pairingKind: first.pairingKind as PairingKind | null,
    createdAt: first.createdAt,
    sides: { A: [], B: [] },
    winningSide: first.winningSide as Side | null,
    resultRecordedAt: first.resultRecordedAt,
    resultRecordedByUserId: first.resultRecordedByUserId,
    reversedAt: first.reversedAt,
    cancelledAt: first.cancelledAt,
    participantMemberIds: [],
  };
  for (const r of rows) {
    detail.sides[r.side as Side].push({
      memberId: r.memberId,
      displayName: r.displayName,
      seat: r.seat as Seat,
    });
    detail.participantMemberIds.push(r.memberId);
  }
  return detail;
}

// Members in club for the agreement-create flow's seat pickers.
// Spec 024 — also projects avatarKey + avatarUploadAt so the
// MemberPickerDropdown can render each candidate's face inline
// with their name.
export async function listActiveClubMembers(clubId: string) {
  return db
    .select({
      id: members.id,
      displayName: members.displayName,
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
    })
    .from(members)
    .where(and(eq(members.clubId, clubId), eq(members.isActive, true)))
    .orderBy(asc(members.displayName));
}
