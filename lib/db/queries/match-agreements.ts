import 'server-only';
import { and, asc, desc, eq, inArray, isNull, isNotNull, notExists, sql } from 'drizzle-orm';

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
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { members } from '@/lib/db/schema/members';

// Spec 030 — recording a for-beer result no longer settles. It creates
// one PENDING match_bet_debt per losing↔winning pair (no consumption,
// transfer, stock, or session change). Settlement is deferred to
// delivery ("Předáno") in lib/db/queries/match-bet-debts.ts, which
// reuses the consumption + bet_transfer accounting. The old spec-018
// auto-settle helpers (settleOnePair, pickBetBeer, split, last-beer)
// are gone from this path.

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
  // Spec 030 — the beer the match is for (when forBeer). Stored on the
  // agreement; becomes each debt's planned beer at record time.
  betBeerTypeId?: string | null;
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
        // Only stash a beer when the match is for beer.
        betBeerTypeId: args.input.forBeer ? args.input.betBeerTypeId ?? null : null,
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

export interface RecordResultArgs {
  agreementId: string;
  clubId: string;
  recordedByUserId: string;
  winningSide: Side;
}

export type RecordResultResult =
  | {
      ok: true;
      matchRowIds: string[];
      // Spec 030 — pending beer-debts created (0 for a friendly match).
      debtsCreated: number;
    }
  | { ok: false; code: 'NOT_FOUND' }
  | {
      ok: false;
      code: 'ALREADY_RECORDED';
      recordedAt: Date;
      recordedByUserId: string | null;
    }
  | { ok: false; code: 'CANCELLED' };

// Spec 027 perf — sentinel thrown when the optimistic-lock UPDATE
// inside recordResultTx returns 0 rows (another caller already
// stamped resultRecordedAt). The throw is needed to roll back the
// transaction's already-completed inserts (matches + pending debts);
// the outer try/catch converts it
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

      // Spec 030 — for-beer matches: each pair owes the club's
      // loser-beer-count (default 1) as a PENDING debt. No money,
      // stock, consumption, or session touched at record time.
      let beerCountPerPair = 0;
      if (agreement.forBeer) {
        const club = await tx.query.clubs.findFirst({
          where: eq(clubs.id, args.clubId),
        });
        if (!club) throw new Error('recordResultTx: club not found');
        beerCountPerPair = club.matchLoserBeerCount;
      }

      const matchRowIds: string[] = [];
      let debtsCreated = 0;

      for (const pair of pairs) {
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

        if (agreement.forBeer && beerCountPerPair > 0) {
          await tx.insert(matchBetDebts).values({
            clubId: args.clubId,
            matchId: matchRow.id,
            agreementId: args.agreementId,
            fromMemberId: pair.loserMemberId,
            toMemberId: pair.winnerMemberId,
            plannedBeerTypeId: agreement.betBeerTypeId ?? null,
            beerCount: beerCountPerPair,
            createdByUserId: args.recordedByUserId,
          });
          debtsCreated += 1;
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
        debtsCreated,
      };
    });
  } catch (e) {
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

    // Spec 030 — void any STILL-PENDING beer-debts (no money to unwind;
    // delivered debts already had their transfers voided above). Status
    // transition, not delete (constitution V).
    await tx
      .update(matchBetDebts)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidedByUserId: args.reversedByUserId,
      })
      .where(
        and(eq(matchBetDebts.agreementId, args.agreementId), eq(matchBetDebts.status, 'pending')),
      );

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
    A: OpenAgreementSideMember[];
    B: OpenAgreementSideMember[];
  };
}

export interface OpenAgreementSideMember {
  memberId: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
  seat: Seat;
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
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
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
      avatarKey: r.avatarKey,
      avatarUploadAt: r.avatarUploadAt,
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
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
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
      avatarKey: r.avatarKey,
      avatarUploadAt: r.avatarUploadAt,
      seat: r.seat as Seat,
    });
  }
  return Array.from(byAgreement.values());
}

export interface RecentResultSummary extends OpenAgreementSummary {
  winningSide: Side;
  resultRecordedAt: Date;
}

/**
 * The club's most-recent recorded match results (not reversed, not
 * cancelled), newest first. Powers the /match "Recent results" section
 * so the match surface actually shows matches you've played — not just
 * open ones + bets. Two-step so the LIMIT applies per agreement, not
 * per side-join row.
 */
export async function listRecentResults(
  clubId: string,
  limit = 5,
): Promise<RecentResultSummary[]> {
  const latest = await db
    .select({ id: matchAgreements.id })
    .from(matchAgreements)
    .where(
      and(
        eq(matchAgreements.clubId, clubId),
        isNotNull(matchAgreements.resultRecordedAt),
        isNull(matchAgreements.reversedAt),
        isNull(matchAgreements.cancelledAt),
      ),
    )
    .orderBy(desc(matchAgreements.resultRecordedAt))
    .limit(limit);
  if (latest.length === 0) return [];
  const ids = latest.map((l) => l.id);

  const rows = await db
    .select({
      id: matchAgreements.id,
      format: matchAgreements.format,
      forBeer: matchAgreements.forBeer,
      pairingKind: matchAgreements.pairingKind,
      createdAt: matchAgreements.createdAt,
      winningSide: matchAgreements.winningSide,
      resultRecordedAt: matchAgreements.resultRecordedAt,
      side: matchAgreementSides.side,
      seat: matchAgreementSides.seat,
      memberId: members.id,
      displayName: members.displayName,
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
    })
    .from(matchAgreements)
    .innerJoin(matchAgreementSides, eq(matchAgreementSides.agreementId, matchAgreements.id))
    .innerJoin(members, eq(members.id, matchAgreementSides.memberId))
    .where(inArray(matchAgreements.id, ids))
    .orderBy(asc(matchAgreementSides.side), asc(matchAgreementSides.seat));

  const byAgreement = new Map<string, RecentResultSummary>();
  for (const r of rows) {
    let agg = byAgreement.get(r.id);
    if (!agg) {
      agg = {
        id: r.id,
        format: r.format,
        forBeer: r.forBeer,
        pairingKind: r.pairingKind as PairingKind | null,
        createdAt: r.createdAt,
        winningSide: r.winningSide as Side,
        resultRecordedAt: r.resultRecordedAt!,
        sides: { A: [], B: [] },
      };
      byAgreement.set(r.id, agg);
    }
    agg.sides[r.side as Side].push({
      memberId: r.memberId,
      displayName: r.displayName,
      avatarKey: r.avatarKey,
      avatarUploadAt: r.avatarUploadAt,
      seat: r.seat as Seat,
    });
  }
  // Preserve the newest-first order from the `latest` query.
  return ids.map((id) => byAgreement.get(id)!).filter(Boolean);
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
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
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
      avatarKey: r.avatarKey,
      avatarUploadAt: r.avatarUploadAt,
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
