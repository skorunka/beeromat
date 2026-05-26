import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { matchBetTransfers } from '@/lib/db/schema/matches';
import { drinkSessions, type DrinkSession } from '@/lib/db/schema/sessions';
import { getBetTransfersForSession, type BetTransferRow } from './bets';

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

  const rows = await db
    .select({
      consumptionId: consumptions.id,
      beerTypeName: beerTypes.name,
      unitPriceMinor: consumptions.unitPriceMinorSnapshot,
      createdAt: consumptions.createdAt,
      createdByUserId: consumptions.createdByUserId,
      voidId: consumptionVoids.id,
      // Spec 018 — if this consumption sources an unvoided bet
      // transfer, the matchBetTransfers link tells us which match.
      sourceMatchId: matchBetTransfers.matchId,
      betTransferVoidId: betTransferVoids.id,
    })
    .from(consumptions)
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    // Bet transfer chain: only count it when both the transfer and
    // its link are present AND the transfer isn't voided.
    .leftJoin(betTransfers, eq(betTransfers.sourceConsumptionId, consumptions.id))
    .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
    .leftJoin(matchBetTransfers, eq(matchBetTransfers.betTransferId, betTransfers.id))
    .where(
      and(
        eq(consumptions.memberId, args.memberId),
        eq(consumptions.drinkSessionId, args.session.id),
      ),
    )
    .orderBy(desc(consumptions.createdAt));

  const now = Date.now();
  const windowMs = args.undoWindowSeconds * 1000;
  const entries: MemberTabEntry[] = rows.map((r) => {
    const voided = r.voidId !== null;
    const isLogger = r.createdByUserId === args.userId;
    const inWindow = now - r.createdAt.getTime() <= windowMs;
    return {
      id: r.consumptionId,
      kind: 'consumption' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided,
      canUndo: !voided && isLogger && inWindow,
      // Surface match-link only when the linked bet transfer is
      // still alive (not voided). If a match has been reversed
      // the transfer is voided and the "ze zápasu" subtitle goes
      // away.
      sourceMatchId: r.betTransferVoidId === null ? r.sourceMatchId : null,
    };
  });

  const totalMinor = entries.reduce(
    (acc, e) => (e.voided ? acc : acc + e.unitPriceMinor),
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

  return Promise.all(
    sessionRows.map(async (s) => ({
      ...s,
      myTotalMinor: await effectiveConsumptionTotal(args.memberId, s.id),
    })),
  );
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
