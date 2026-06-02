import 'server-only';
import { and, desc, eq, inArray, isNull, notExists, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { matchBetTransfers, matches } from '@/lib/db/schema/matches';
import { members } from '@/lib/db/schema/members';
import { drinkSessions, type DrinkSession } from '@/lib/db/schema/sessions';
import { getBetTransfersForSession, type BetTransferRow } from './bets';

// Spec 023 — second alias on `members` so we can join the LOGGER's
// member row (when an on-behalf log) alongside the existing CONSUMER
// join, and pull the logger's avatar fields.
const loggerMembers = alias(members, 'logger_members');
// Third alias — the OTHER party of a bet transfer away from the
// member's own consumption (the loser who picks up the tab). Used to
// label the winner's transfer_out row ("z vyhrané sázky: {loser}").
const transferToMembers = alias(members, 'transfer_to_members');

/**
 * Spec 017 — predictive-default lookup for home's one-tap log button.
 * Returns the beer type of the member's most recent non-voided
 * consumption in the active club, or null if the member has never
 * logged anything in this club. Single round-trip; LEFT JOIN on
 * `consumption_voids` filters voided rows out without a subquery.
 *
 * The caller decides the UI variant from `isArchived` + `currentStock`:
 *   isArchived = true              → generic "Zapiš pivo" link
 *   currentStock <= 0              → disabled "{name} — nedostupné"
 *   otherwise                      → enabled "Zapiš {name}"
 */
export interface LastBeerForMember {
  id: string;
  name: string;
  currentStock: number;
  isArchived: boolean;
  unitPriceMinor: bigint;
}

export async function lastBeerForMember(
  memberId: string,
  clubId: string,
  // Spec 018 — optional tx so this can be called from inside
  // another transaction (e.g. recordResultTx) without deadlocking
  // PGlite. Defaults to the outer `db` for read-only callers.
  txOrDb: typeof db = db,
): Promise<LastBeerForMember | null> {
  const [row] = await txOrDb
    .select({
      id: beerTypes.id,
      name: beerTypes.name,
      currentStock: beerTypes.currentStock,
      isArchived: beerTypes.isArchived,
      unitPriceMinor: beerTypes.unitPriceMinor,
    })
    .from(consumptions)
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(
      and(
        eq(consumptions.memberId, memberId),
        eq(consumptions.clubId, clubId),
        isNull(consumptionVoids.consumptionId),
      ),
    )
    .orderBy(desc(consumptions.createdAt))
    .limit(1);

  return row ?? null;
}

/** Shape of a single entry rendered on the my-tab screen. */
export interface MemberTabEntry {
  id: string;
  kind: 'consumption' | 'transfer_in' | 'transfer_out';
  beerTypeName: string;
  unitPriceMinor: bigint;
  createdAt: Date;
  voided: boolean;
  canUndo: boolean;
  // Spec 018 — when this consumption is the source of an active
  // (non-voided) bet_transfer, sourceMatchId links to that match
  // so the UI can render "ze zápasu →" / "from the match →".
  sourceMatchId: string | null;
  // Spec 019 — when the consumption is on-behalf (logger differs
  // from consumer), or for a transfer_in entry, this carries the
  // display name of the OTHER member (the logger for on-behalf,
  // the winner-of-the-bet for transfer_in).
  loggerDisplayName: string | null;
  // Spec 023 — avatar fields for the logger, populated ONLY when
  // kind='consumption' AND the row is on-behalf. transfer_in / self
  // / match-origin rows leave these null (FR-006: only the on-behalf
  // origin type renders an extra avatar).
  loggerMemberId: string | null;
  loggerAvatarKey: string | null;
  loggerAvatarUploadAt: Date | null;
}

export interface MemberTab {
  session: DrinkSession | null;
  entries: MemberTabEntry[];
  totalMinor: bigint;
}

/**
 * Build the my-tab payload for a member in a session.
 * v1 (US1) only emits `consumption` entries; transfers will be added
 * alongside US6.
 */
export async function getMyTabForSession(args: {
  memberId: string;
  userId: string;
  session: DrinkSession | null;
  undoWindowSeconds: number;
}): Promise<MemberTab> {
  if (!args.session) {
    return { session: null, entries: [], totalMinor: 0n };
  }

  // Two queries in parallel: (1) the member's own consumptions
  // in this session — both self-logs and on-behalf logs land
  // here because `member_id = consumer`. (2) bet transfers
  // pointing AT this member (the loser's view) for any
  // consumption that sits in this session — emitted as
  // `transfer_in` entries so the /tab line items match the
  // balance total (spec 019 FR-007a).
  const [consumptionRows, transferRows] = await Promise.all([
    db
      .select({
        consumptionId: consumptions.id,
        beerTypeName: beerTypes.name,
        unitPriceMinor: consumptions.unitPriceMinorSnapshot,
        createdAt: consumptions.createdAt,
        createdByUserId: consumptions.createdByUserId,
        loggerDisplayName: users.name,
        loggerMemberId: loggerMembers.id,
        loggerAvatarKey: loggerMembers.avatarKey,
        loggerAvatarUploadAt: loggerMembers.avatarUploadAt,
        consumerMemberUserId: members.userId,
        voidId: consumptionVoids.id,
        // The "view the match" link targets /match/[agreementId], so
        // resolve the bet's match → its agreement id (not the matches
        // row id, which 404s on the detail route).
        sourceMatchId: matches.agreementId,
        betTransferId: betTransfers.id,
        betTransferVoidId: betTransferVoids.id,
        transferToDisplayName: transferToMembers.displayName,
      })
      .from(consumptions)
      .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
      .innerJoin(members, eq(members.id, consumptions.memberId))
      .innerJoin(users, eq(users.id, consumptions.createdByUserId))
      .leftJoin(
        loggerMembers,
        and(
          eq(loggerMembers.userId, consumptions.createdByUserId),
          eq(loggerMembers.clubId, consumptions.clubId),
        ),
      )
      .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
      // Join only the ACTIVE (non-voided) transfer away from this
      // consumption. A consumption may legitimately carry several
      // bet_transfer rows over time (transfer → void → re-transfer —
      // see createBetTransferAction), but at most one is active. An
      // unfiltered join would fan a single consumption into multiple
      // tab rows (one per historic transfer).
      .leftJoin(
        betTransfers,
        and(
          eq(betTransfers.sourceConsumptionId, consumptions.id),
          notExists(
            db
              .select()
              .from(betTransferVoids)
              .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
          ),
        ),
      )
      .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
      .leftJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
      .leftJoin(matches, eq(matches.id, matchBetTransfers.matchId))
      .leftJoin(transferToMembers, eq(transferToMembers.id, betTransfers.toMemberId))
      .where(
        and(
          eq(consumptions.memberId, args.memberId),
          eq(consumptions.drinkSessionId, args.session.id),
        ),
      )
      .orderBy(desc(consumptions.createdAt)),
    db
      .select({
        transferId: betTransfers.id,
        sourceConsumptionId: betTransfers.sourceConsumptionId,
        beerTypeName: beerTypes.name,
        unitPriceMinor: consumptions.unitPriceMinorSnapshot,
        createdAt: betTransfers.createdAt,
        fromMemberDisplayName: members.displayName,
        sourceMatchId: matches.agreementId,
        voidId: betTransferVoids.id,
      })
      .from(betTransfers)
      .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
      .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
      .innerJoin(members, eq(members.id, betTransfers.fromMemberId))
      .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
      .leftJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
      .leftJoin(matches, eq(matches.id, matchBetTransfers.matchId))
      .where(
        and(
          eq(betTransfers.toMemberId, args.memberId),
          eq(consumptions.drinkSessionId, args.session.id),
        ),
      )
      .orderBy(desc(betTransfers.createdAt)),
  ]);

  const now = Date.now();
  const windowMs = args.undoWindowSeconds * 1000;

  const consumptionEntries: MemberTabEntry[] = consumptionRows.map((r) => {
    const voided = r.voidId !== null;
    const isLogger = r.createdByUserId === args.userId;
    const inWindow = now - r.createdAt.getTime() <= windowMs;
    // On-behalf: createdByUserId differs from the consumer's user id.
    const isOnBehalf = r.createdByUserId !== r.consumerMemberUserId;
    // Won-bet: this own consumption has an ACTIVE (non-voided) bet
    // transfer away from it — the cost moved to the loser, so it must
    // NOT count toward this member's total (mirrors
    // effectiveConsumptionTotal). Rendered as a transfer_out credit.
    const transferredAway = r.betTransferId !== null && r.betTransferVoidId === null;
    if (transferredAway && !voided) {
      return {
        id: r.consumptionId,
        kind: 'transfer_out' as const,
        beerTypeName: r.beerTypeName,
        unitPriceMinor: r.unitPriceMinor,
        createdAt: r.createdAt,
        voided: false,
        canUndo: false,
        sourceMatchId: r.sourceMatchId,
        // The OTHER party shown on the winner's row is the loser.
        loggerDisplayName: r.transferToDisplayName,
        loggerMemberId: null,
        loggerAvatarKey: null,
        loggerAvatarUploadAt: null,
      };
    }
    return {
      id: r.consumptionId,
      kind: 'consumption' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided,
      canUndo: !voided && isLogger && inWindow,
      sourceMatchId: r.betTransferVoidId === null ? r.sourceMatchId : null,
      loggerDisplayName: isOnBehalf ? r.loggerDisplayName : null,
      loggerMemberId: isOnBehalf ? r.loggerMemberId : null,
      loggerAvatarKey: isOnBehalf ? r.loggerAvatarKey : null,
      loggerAvatarUploadAt: isOnBehalf ? r.loggerAvatarUploadAt : null,
    };
  });

  const transferEntries: MemberTabEntry[] = transferRows
    .filter((r) => r.voidId === null)
    .map((r) => ({
      id: r.transferId,
      kind: 'transfer_in' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided: false,
      canUndo: false,
      sourceMatchId: r.sourceMatchId,
      loggerDisplayName: r.fromMemberDisplayName,
      loggerMemberId: null,
      loggerAvatarKey: null,
      loggerAvatarUploadAt: null,
    }));

  // Merge + sort by createdAt DESC (Constitution V — single
  // chronological line item list for the consumer).
  const entries = [...consumptionEntries, ...transferEntries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // transfer_out rows are won-bet credits — the cost moved to the
  // loser, so they don't add to the member's total (parity with
  // effectiveConsumptionTotal).
  const totalMinor = entries.reduce(
    (acc, e) => (e.voided || e.kind === 'transfer_out' ? acc : acc + e.unitPriceMinor),
    0n,
  );

  return { session: args.session, entries, totalMinor };
}

/**
 * Treasurer-side counterpart to `getMyTabForSession`. Same row shape
 * (and so the same `<TabEntryRow />` component renders it) but scoped
 * to ANY member of the club — no `userId` argument because the admin
 * never has undo affordance from this view. `canUndo` is always false.
 *
 * Returns entries from the currently open drink session only; older
 * sessions live in the per-member history navigation. Matches the
 * `/tab` semantics so the admin sees what the member sees.
 */
export async function getMemberTabForAdmin(args: {
  memberId: string;
  session: DrinkSession | null;
}): Promise<MemberTab> {
  if (!args.session) {
    return { session: null, entries: [], totalMinor: 0n };
  }

  const [consumptionRows, transferRows] = await Promise.all([
    db
      .select({
        consumptionId: consumptions.id,
        beerTypeName: beerTypes.name,
        unitPriceMinor: consumptions.unitPriceMinorSnapshot,
        createdAt: consumptions.createdAt,
        loggerDisplayName: users.name,
        loggerMemberId: loggerMembers.id,
        loggerAvatarKey: loggerMembers.avatarKey,
        loggerAvatarUploadAt: loggerMembers.avatarUploadAt,
        consumerMemberUserId: members.userId,
        createdByUserId: consumptions.createdByUserId,
        voidId: consumptionVoids.id,
        sourceMatchId: matches.agreementId,
        betTransferId: betTransfers.id,
        betTransferVoidId: betTransferVoids.id,
        transferToDisplayName: transferToMembers.displayName,
      })
      .from(consumptions)
      .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
      .innerJoin(members, eq(members.id, consumptions.memberId))
      .innerJoin(users, eq(users.id, consumptions.createdByUserId))
      .leftJoin(
        loggerMembers,
        and(
          eq(loggerMembers.userId, consumptions.createdByUserId),
          eq(loggerMembers.clubId, consumptions.clubId),
        ),
      )
      .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
      // Join only the ACTIVE (non-voided) transfer away from this
      // consumption. A consumption may legitimately carry several
      // bet_transfer rows over time (transfer → void → re-transfer —
      // see createBetTransferAction), but at most one is active. An
      // unfiltered join would fan a single consumption into multiple
      // tab rows (one per historic transfer).
      .leftJoin(
        betTransfers,
        and(
          eq(betTransfers.sourceConsumptionId, consumptions.id),
          notExists(
            db
              .select()
              .from(betTransferVoids)
              .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
          ),
        ),
      )
      .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
      .leftJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
      .leftJoin(matches, eq(matches.id, matchBetTransfers.matchId))
      .leftJoin(transferToMembers, eq(transferToMembers.id, betTransfers.toMemberId))
      .where(
        and(
          eq(consumptions.memberId, args.memberId),
          eq(consumptions.drinkSessionId, args.session.id),
        ),
      )
      .orderBy(desc(consumptions.createdAt)),
    db
      .select({
        transferId: betTransfers.id,
        beerTypeName: beerTypes.name,
        unitPriceMinor: consumptions.unitPriceMinorSnapshot,
        createdAt: betTransfers.createdAt,
        fromMemberDisplayName: members.displayName,
        sourceMatchId: matches.agreementId,
        voidId: betTransferVoids.id,
      })
      .from(betTransfers)
      .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
      .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
      .innerJoin(members, eq(members.id, betTransfers.fromMemberId))
      .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
      .leftJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
      .leftJoin(matches, eq(matches.id, matchBetTransfers.matchId))
      .where(
        and(
          eq(betTransfers.toMemberId, args.memberId),
          eq(consumptions.drinkSessionId, args.session.id),
        ),
      )
      .orderBy(desc(betTransfers.createdAt)),
  ]);

  const consumptionEntries: MemberTabEntry[] = consumptionRows.map((r) => {
    const voided = r.voidId !== null;
    const isOnBehalf = r.createdByUserId !== r.consumerMemberUserId;
    const transferredAway = r.betTransferId !== null && r.betTransferVoidId === null;
    if (transferredAway && !voided) {
      return {
        id: r.consumptionId,
        kind: 'transfer_out' as const,
        beerTypeName: r.beerTypeName,
        unitPriceMinor: r.unitPriceMinor,
        createdAt: r.createdAt,
        voided: false,
        canUndo: false,
        sourceMatchId: r.sourceMatchId,
        loggerDisplayName: r.transferToDisplayName,
        loggerMemberId: null,
        loggerAvatarKey: null,
        loggerAvatarUploadAt: null,
      };
    }
    return {
      id: r.consumptionId,
      kind: 'consumption' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided,
      canUndo: false,
      sourceMatchId: r.betTransferVoidId === null ? r.sourceMatchId : null,
      loggerDisplayName: isOnBehalf ? r.loggerDisplayName : null,
      loggerMemberId: isOnBehalf ? r.loggerMemberId : null,
      loggerAvatarKey: isOnBehalf ? r.loggerAvatarKey : null,
      loggerAvatarUploadAt: isOnBehalf ? r.loggerAvatarUploadAt : null,
    };
  });

  const transferEntries: MemberTabEntry[] = transferRows
    .filter((r) => r.voidId === null)
    .map((r) => ({
      id: r.transferId,
      kind: 'transfer_in' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided: false,
      canUndo: false,
      sourceMatchId: r.sourceMatchId,
      loggerDisplayName: r.fromMemberDisplayName,
      loggerMemberId: null,
      loggerAvatarKey: null,
      loggerAvatarUploadAt: null,
    }));

  const entries = [...consumptionEntries, ...transferEntries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const totalMinor = entries.reduce(
    (acc, e) => (e.voided || e.kind === 'transfer_out' ? acc : acc + e.unitPriceMinor),
    0n,
  );

  return { session: args.session, entries, totalMinor };
}

export interface SessionHistoryItem {
  id: string;
  title: string | null;
  startedAt: Date;
  endedAt: Date | null;
  myTotalMinor: bigint;
}

/**
 * Past (and current) drink sessions the member took part in, newest
 * first, with the member's effective total for each (contracts/
 * consumption.md → getSessionHistory). US8.
 *
 * Spec 027 perf — previously this ran `effectiveConsumptionTotal`
 * (2 queries) per session in a Promise.all, so a 50-session
 * history fired 100 round-trips. Now two batched aggregations
 * (own consumptions per session, transferred-in per session)
 * compute every session's effective total in 3 queries total,
 * regardless of history length. Merge happens in JS.
 */
export async function getSessionHistory(args: {
  clubId: string;
  memberId: string;
  limit?: number;
}): Promise<SessionHistoryItem[]> {
  const sessionRows = await db
    .selectDistinct({
      id: drinkSessions.id,
      title: drinkSessions.title,
      startedAt: drinkSessions.startedAt,
      endedAt: drinkSessions.endedAt,
    })
    .from(drinkSessions)
    .innerJoin(consumptions, eq(consumptions.drinkSessionId, drinkSessions.id))
    .where(
      and(eq(drinkSessions.clubId, args.clubId), eq(consumptions.memberId, args.memberId)),
    )
    .orderBy(desc(drinkSessions.startedAt))
    .limit(args.limit ?? 50);

  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((s) => s.id);

  // Two batched aggregations: own consumptions + transferred-in,
  // both grouped by session_id. Same semantics as
  // `effectiveConsumptionTotal` but in O(1) DB calls instead of O(n).
  const [ownTotals, transferredInTotals] = await Promise.all([
    db
      .select({
        sessionId: consumptions.drinkSessionId,
        total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt),
      })
      .from(consumptions)
      .where(
        and(
          eq(consumptions.memberId, args.memberId),
          inArray(consumptions.drinkSessionId, sessionIds),
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
      )
      .groupBy(consumptions.drinkSessionId),
    db
      .select({
        sessionId: consumptions.drinkSessionId,
        total: sum(consumptions.unitPriceMinorSnapshot).mapWith(BigInt),
      })
      .from(betTransfers)
      .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
      .where(
        and(
          eq(betTransfers.toMemberId, args.memberId),
          inArray(consumptions.drinkSessionId, sessionIds),
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
      )
      .groupBy(consumptions.drinkSessionId),
  ]);

  const ownBySession = new Map(ownTotals.map((r) => [r.sessionId, r.total ?? 0n]));
  const transferredBySession = new Map(
    transferredInTotals.map((r) => [r.sessionId, r.total ?? 0n]),
  );

  return sessionRows.map((s) => ({
    ...s,
    myTotalMinor:
      (ownBySession.get(s.id) ?? 0n) + (transferredBySession.get(s.id) ?? 0n),
  }));
}

export interface SessionDetail {
  session: DrinkSession;
  entries: MemberTabEntry[];
  transfers: BetTransferRow[];
  totalMinor: bigint;
}

/**
 * Drill-down into one session for a member: their consumption line
 * items, the bet transfers they were party to, and their effective
 * total (contracts/consumption.md → getSessionDetail). US8.
 */
export async function getSessionDetail(args: {
  clubId: string;
  sessionId: string;
  memberId: string;
  userId: string;
  undoWindowSeconds: number;
}): Promise<SessionDetail | null> {
  const session = await db.query.drinkSessions.findFirst({
    where: and(eq(drinkSessions.id, args.sessionId), eq(drinkSessions.clubId, args.clubId)),
  });
  if (!session) return null;

  const [tab, transfers, totalMinor] = await Promise.all([
    getMyTabForSession({
      memberId: args.memberId,
      userId: args.userId,
      session,
      undoWindowSeconds: args.undoWindowSeconds,
    }),
    getBetTransfersForSession({ sessionId: args.sessionId, memberId: args.memberId }),
    effectiveConsumptionTotal(args.memberId, args.sessionId),
  ]);

  return { session, entries: tab.entries, transfers, totalMinor };
}
