import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransfers } from '@/lib/db/schema/bets';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { matchBetTransfers } from '@/lib/db/schema/matches';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { pickBetBeer, NoBeerInStockError, type BetBeerCandidate } from '@/lib/match/default-bet-beer';

// Spec 030 — beer-IOU reads + the deliver ("Předáno") transaction.
//
// Pending debts are created by recordResultTx (lib/db/queries/
// match-agreements.ts). Delivery is where the money finally moves:
// it reuses the consumption + bet_transfer accounting that used to run
// at record time, so /tab, breakdown, and balance stay consistent.
// Delivery is ALL-OR-NOTHING (unlike the old best-effort settleOnePair):
// it pre-checks stock and refuses rather than partially settling.

// ── Read: a member's open IOUs, both directions ──────────────────────

export interface BeerDebtRow {
  debtId: string;
  agreementId: string;
  counterpartyMemberId: string;
  counterpartyName: string;
  counterpartyAvatarKey: string | null;
  counterpartyAvatarUploadAt: Date | null;
  plannedBeerTypeId: string | null;
  plannedBeerName: string | null;
  beerCount: number;
  createdAt: Date;
}

export interface MemberBeerDebts {
  /** Debts where the member is the winner (someone owes them). */
  owedToMe: BeerDebtRow[];
  /** Debts where the member is the loser (they owe). */
  iOwe: BeerDebtRow[];
}

export async function listBeerDebtsForMember(args: {
  clubId: string;
  memberId: string;
}): Promise<MemberBeerDebts> {
  // owedToMe: to_member = me → counterparty is from_member (the loser).
  const owedToMe = await db
    .select({
      debtId: matchBetDebts.id,
      agreementId: matchBetDebts.agreementId,
      counterpartyMemberId: members.id,
      counterpartyName: members.displayName,
      counterpartyAvatarKey: members.avatarKey,
      counterpartyAvatarUploadAt: members.avatarUploadAt,
      plannedBeerTypeId: matchBetDebts.plannedBeerTypeId,
      plannedBeerName: beerTypes.name,
      beerCount: matchBetDebts.beerCount,
      createdAt: matchBetDebts.createdAt,
    })
    .from(matchBetDebts)
    .innerJoin(members, eq(members.id, matchBetDebts.fromMemberId))
    .leftJoin(beerTypes, eq(beerTypes.id, matchBetDebts.plannedBeerTypeId))
    .where(
      and(
        eq(matchBetDebts.clubId, args.clubId),
        eq(matchBetDebts.toMemberId, args.memberId),
        eq(matchBetDebts.status, 'pending'),
      ),
    )
    .orderBy(asc(matchBetDebts.createdAt));

  // iOwe: from_member = me → counterparty is to_member (the winner).
  const iOwe = await db
    .select({
      debtId: matchBetDebts.id,
      agreementId: matchBetDebts.agreementId,
      counterpartyMemberId: members.id,
      counterpartyName: members.displayName,
      counterpartyAvatarKey: members.avatarKey,
      counterpartyAvatarUploadAt: members.avatarUploadAt,
      plannedBeerTypeId: matchBetDebts.plannedBeerTypeId,
      plannedBeerName: beerTypes.name,
      beerCount: matchBetDebts.beerCount,
      createdAt: matchBetDebts.createdAt,
    })
    .from(matchBetDebts)
    .innerJoin(members, eq(members.id, matchBetDebts.toMemberId))
    .leftJoin(beerTypes, eq(beerTypes.id, matchBetDebts.plannedBeerTypeId))
    .where(
      and(
        eq(matchBetDebts.clubId, args.clubId),
        eq(matchBetDebts.fromMemberId, args.memberId),
        eq(matchBetDebts.status, 'pending'),
      ),
    )
    .orderBy(asc(matchBetDebts.createdAt));

  return { owedToMe, iOwe };
}

// ── Write: deliver one IOU ("Předáno") ───────────────────────────────

export interface DeliverBeerDebtArgs {
  debtId: string;
  clubId: string;
  actorUserId: string;
  actorMemberId: string;
  /** treasurer/club_admin — may settle a debt they aren't party to. */
  isElevated: boolean;
  /** Explicit beer override; falls back to planned → cheapest in stock. */
  beerTypeId?: string | null;
}

export type DeliverBeerDebtResult =
  | { ok: true; beerName: string; loserName: string }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'ALREADY_SETTLED' }
  | { ok: false; code: 'OUT_OF_STOCK' }
  | { ok: false; code: 'BEER_NOT_AVAILABLE' };

export async function deliverBeerDebtTx(
  args: DeliverBeerDebtArgs,
): Promise<DeliverBeerDebtResult> {
  return db.transaction(async (tx) => {
    const debt = await tx.query.matchBetDebts.findFirst({
      where: and(eq(matchBetDebts.id, args.debtId), eq(matchBetDebts.clubId, args.clubId)),
    });
    if (!debt) return { ok: false, code: 'NOT_FOUND' as const };

    // Authz: a party to the debt, or an elevated role.
    const isParty = debt.fromMemberId === args.actorMemberId || debt.toMemberId === args.actorMemberId;
    if (!isParty && !args.isElevated) return { ok: false, code: 'FORBIDDEN' as const };

    if (debt.status !== 'pending') return { ok: false, code: 'ALREADY_SETTLED' as const };

    // Resolve the beer to charge.
    const catalog: BetBeerCandidate[] = await tx
      .select({
        id: beerTypes.id,
        name: beerTypes.name,
        currentStock: beerTypes.currentStock,
        isArchived: beerTypes.isArchived,
        unitPriceMinor: beerTypes.unitPriceMinor,
      })
      .from(beerTypes)
      .where(eq(beerTypes.clubId, args.clubId));

    let chosen: BetBeerCandidate;
    if (args.beerTypeId) {
      // Explicit override — must be a real, non-archived club beer.
      const match = catalog.find((b) => b.id === args.beerTypeId);
      if (!match || match.isArchived) return { ok: false, code: 'BEER_NOT_AVAILABLE' as const };
      chosen = match;
    } else {
      try {
        chosen = pickBetBeer({
          override: debt.plannedBeerTypeId ?? undefined,
          lastBeer: null,
          catalog,
        });
      } catch (e) {
        if (e instanceof NoBeerInStockError) return { ok: false, code: 'OUT_OF_STOCK' as const };
        throw e;
      }
    }

    // All-or-nothing: refuse unless the whole debt can be covered.
    if (chosen.currentStock < debt.beerCount) return { ok: false, code: 'OUT_OF_STOCK' as const };

    // Claim the debt (optimistic lock — house idiom). 0 rows ⇒ someone
    // already delivered it; bail before touching money.
    const claimed = await tx
      .update(matchBetDebts)
      .set({
        status: 'settled',
        settledAt: new Date(),
        settledByUserId: args.actorUserId,
        settledBeerTypeId: chosen.id,
      })
      .where(and(eq(matchBetDebts.id, args.debtId), eq(matchBetDebts.status, 'pending')))
      .returning({ id: matchBetDebts.id });
    if (claimed.length === 0) return { ok: false, code: 'ALREADY_SETTLED' as const };

    // Ensure an open drink session (same find-or-open as logging a beer).
    let sessionId: string;
    const [openSession] = await tx
      .select({ id: drinkSessions.id })
      .from(drinkSessions)
      .where(and(eq(drinkSessions.clubId, args.clubId), sql`${drinkSessions.endedAt} IS NULL`))
      .limit(1);
    if (openSession) {
      sessionId = openSession.id;
    } else {
      await tx
        .insert(drinkSessions)
        .values({ clubId: args.clubId, openedByUserId: args.actorUserId, startedAt: new Date() })
        .onConflictDoNothing();
      const [reselected] = await tx
        .select({ id: drinkSessions.id })
        .from(drinkSessions)
        .where(and(eq(drinkSessions.clubId, args.clubId), sql`${drinkSessions.endedAt} IS NULL`))
        .limit(1);
      if (!reselected) throw new Error('deliverBeerDebtTx: failed to auto-open session');
      sessionId = reselected.id;
    }

    // Book the cost: winner drinks, loser pays — one consumption +
    // bet_transfer (winner→loser) + match link per beer. Stock was
    // pre-checked, so the guarded decrement should always succeed; a 0
    // row means a concurrent drain — throw to roll the whole thing back
    // (all-or-nothing, no partial settle).
    for (let i = 0; i < debt.beerCount; i += 1) {
      const decremented = await tx
        .update(beerTypes)
        .set({ currentStock: sql`${beerTypes.currentStock} - 1` })
        .where(and(eq(beerTypes.id, chosen.id), sql`${beerTypes.currentStock} > 0`))
        .returning({ currentStock: beerTypes.currentStock });
      if (decremented.length === 0) throw new Error('deliverBeerDebtTx: stock drained mid-settle');

      await tx.insert(stockChanges).values({
        clubId: args.clubId,
        beerTypeId: chosen.id,
        delta: -1,
        kind: 'consumption_decrement',
        createdByUserId: args.actorUserId,
      });

      const [consumption] = await tx
        .insert(consumptions)
        .values({
          clubId: args.clubId,
          drinkSessionId: sessionId,
          memberId: debt.toMemberId, // winner drank it
          beerTypeId: chosen.id,
          unitPriceMinorSnapshot: chosen.unitPriceMinor,
          createdByUserId: args.actorUserId,
        })
        .returning();
      if (!consumption) throw new Error('deliverBeerDebtTx: insert consumption failed');

      const [transfer] = await tx
        .insert(betTransfers)
        .values({
          clubId: args.clubId,
          sourceConsumptionId: consumption.id,
          fromMemberId: debt.toMemberId, // cost moves FROM winner…
          toMemberId: debt.fromMemberId, // …TO loser (loser pays)
          createdByUserId: args.actorUserId,
        })
        .returning();
      if (!transfer) throw new Error('deliverBeerDebtTx: insert bet_transfer failed');

      await tx.insert(matchBetTransfers).values({ matchId: debt.matchId, betTransferId: transfer.id });
    }

    const [loser] = await tx
      .select({ name: members.displayName })
      .from(members)
      .where(eq(members.id, debt.fromMemberId))
      .limit(1);

    return { ok: true as const, beerName: chosen.name, loserName: loser?.name ?? '' };
  });
}
