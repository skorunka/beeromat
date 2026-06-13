import 'server-only';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  isNotNull,
  isNull,
  ne,
  or,
  sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matches, matchAgreements, matchAgreementSides } from '@/lib/db/schema/matches';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { memberBalance } from '@/lib/balance/calculate';
import { currentWinStreak, bestWinStreak } from '@/lib/stats/streak';
import { pickNemesis, pickFavouriteVictim } from '@/lib/stats/head-to-head';
import { pickBestPartner, pickJinxPartner } from '@/lib/stats/partners';
import { beersPerNight } from '@/lib/stats/beers-per-night';
import type { HeadToHead, MemberFace, MemberStats, PartnerRecord } from '@/lib/stats/types';

// Spec 034 — assemble one member's stats. Bounded per-member queries (this is
// a single profile), then the pure lib/stats selectors do the selection so
// they stay unit-tested. Voided consumptions + reversed/cancelled/voided
// matches are excluded.

export async function getPlayerStats(args: {
  clubId: string;
  memberId: string;
}): Promise<MemberStats | null> {
  const me = await db.query.members.findFirst({
    where: and(eq(members.id, args.memberId), eq(members.clubId, args.clubId)),
  });
  if (!me) return null;
  const myUserId = me.userId;
  const pSide = alias(matchAgreementSides, 'partner_side');
  const mine = alias(matchAgreementSides, 'my_side');

  const [
    faceRows,
    matchRows,
    partnerRows,
    totalRow,
    sessionRow,
    beerTypeRow,
    favRow,
    roundsRow,
    owesRow,
    tabMinor,
  ] = await Promise.all([
      db
        .select({
          memberId: members.id,
          displayName: members.displayName,
          avatarKey: members.avatarKey,
          avatarUploadAt: members.avatarUploadAt,
        })
        .from(members)
        .where(eq(members.clubId, args.clubId)),
      // The member's matches (non-voided, non-reversed), oldest first.
      db
        .select({
          winner: matches.winnerMemberId,
          loser: matches.loserMemberId,
          playedAt: matches.playedAt,
        })
        .from(matches)
        .leftJoin(matchAgreements, eq(matchAgreements.id, matches.agreementId))
        .where(
          and(
            eq(matches.clubId, args.clubId),
            or(eq(matches.winnerMemberId, args.memberId), eq(matches.loserMemberId, args.memberId)),
            isNull(matches.voidedAt),
            isNull(matchAgreements.reversedAt),
            isNull(matchAgreements.cancelledAt),
          ),
        )
        .orderBy(asc(matches.playedAt)),
      // Doubles partners: the other member on the member's side + whether it won.
      db
        .select({
          partnerId: pSide.memberId,
          mySide: mine.side,
          winningSide: matchAgreements.winningSide,
        })
        .from(mine)
        .innerJoin(matchAgreements, eq(matchAgreements.id, mine.agreementId))
        .innerJoin(
          pSide,
          and(
            eq(pSide.agreementId, mine.agreementId),
            eq(pSide.side, mine.side),
            ne(pSide.memberId, mine.memberId),
          ),
        )
        .where(
          and(
            eq(matchAgreements.clubId, args.clubId),
            eq(mine.memberId, args.memberId),
            eq(matchAgreements.format, 'doubles'),
            isNotNull(matchAgreements.resultRecordedAt),
            isNull(matchAgreements.reversedAt),
            isNull(matchAgreements.cancelledAt),
          ),
        ),
      // beer total (non-voided)
      db
        .select({ n: count() })
        .from(consumptions)
        .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
        .where(
          and(
            eq(consumptions.memberId, args.memberId),
            eq(consumptions.clubId, args.clubId),
            isNull(consumptionVoids.consumptionId),
          ),
        ),
      // distinct sessions the member drank in
      db
        .select({ n: countDistinct(consumptions.drinkSessionId) })
        .from(consumptions)
        .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
        .where(
          and(
            eq(consumptions.memberId, args.memberId),
            eq(consumptions.clubId, args.clubId),
            isNull(consumptionVoids.consumptionId),
          ),
        ),
      // distinct beer types the member logged (non-voided) — spec 035 Connoisseur
      db
        .select({ n: countDistinct(consumptions.beerTypeId) })
        .from(consumptions)
        .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
        .where(
          and(
            eq(consumptions.memberId, args.memberId),
            eq(consumptions.clubId, args.clubId),
            isNull(consumptionVoids.consumptionId),
          ),
        ),
      // favourite beer (mode)
      db
        .select({ beerTypeId: consumptions.beerTypeId, name: beerTypes.name, c: count() })
        .from(consumptions)
        .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
        .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
        .where(
          and(
            eq(consumptions.memberId, args.memberId),
            eq(consumptions.clubId, args.clubId),
            isNull(consumptionVoids.consumptionId),
          ),
        )
        .groupBy(consumptions.beerTypeId, beerTypes.name)
        .orderBy(desc(count()))
        .limit(1),
      // rounds poured = distinct round_id the member logged FOR others
      db
        .select({ n: countDistinct(consumptions.roundId) })
        .from(consumptions)
        .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
        .where(
          and(
            eq(consumptions.clubId, args.clubId),
            eq(consumptions.createdByUserId, myUserId),
            ne(consumptions.memberId, args.memberId),
            isNotNull(consumptions.roundId),
            isNull(consumptionVoids.consumptionId),
          ),
        ),
      // owes the most beers to (open IOUs)
      db
        .select({ toMemberId: matchBetDebts.toMemberId, beers: sum(matchBetDebts.beerCount).mapWith(Number) })
        .from(matchBetDebts)
        .where(
          and(
            eq(matchBetDebts.clubId, args.clubId),
            eq(matchBetDebts.fromMemberId, args.memberId),
            eq(matchBetDebts.status, 'pending'),
          ),
        )
        .groupBy(matchBetDebts.toMemberId)
        .orderBy(desc(sum(matchBetDebts.beerCount)))
        .limit(1),
      memberBalance(args.memberId),
    ]);

  const faces = new Map<string, MemberFace & { memberId: string }>(
    faceRows.map((f) => [f.memberId, f]),
  );

  // Fold matches → record, streaks, head-to-head, lastWinAt.
  let won = 0;
  let lost = 0;
  let lastWinAt: Date | null = null;
  const seq: { won: boolean }[] = [];
  const h2hMap = new Map<string, { wins: number; losses: number }>();
  for (const m of matchRows) {
    const iWon = m.winner === args.memberId;
    const opponentId = iWon ? m.loser : m.winner;
    seq.push({ won: iWon });
    if (iWon) {
      won += 1;
      if (!lastWinAt || m.playedAt > lastWinAt) lastWinAt = m.playedAt;
    } else {
      lost += 1;
    }
    const rec = h2hMap.get(opponentId) ?? { wins: 0, losses: 0 };
    if (iWon) rec.wins += 1;
    else rec.losses += 1;
    h2hMap.set(opponentId, rec);
  }
  const played = won + lost;

  const withFace = <T extends { memberId?: string }>(id: string): MemberFace => {
    const f = faces.get(id);
    return { displayName: f?.displayName ?? '?', avatarKey: f?.avatarKey ?? null, avatarUploadAt: f?.avatarUploadAt ?? null };
  };

  const h2h: HeadToHead[] = [...h2hMap.entries()].map(([opponentId, r]) => ({
    opponentId,
    ...withFace(opponentId),
    wins: r.wins,
    losses: r.losses,
  }));

  // Fold partner rows.
  const partnerMap = new Map<string, { wins: number; games: number }>();
  for (const p of partnerRows) {
    const rec = partnerMap.get(p.partnerId) ?? { wins: 0, games: 0 };
    rec.games += 1;
    if (p.mySide === p.winningSide) rec.wins += 1;
    partnerMap.set(p.partnerId, rec);
  }
  const partners: PartnerRecord[] = [...partnerMap.entries()].map(([partnerId, r]) => ({
    partnerId,
    ...withFace(partnerId),
    wins: r.wins,
    games: r.games,
  }));

  const bestPartner = pickBestPartner(partners);
  let jinxPartner = pickJinxPartner(partners);
  // Don't show the same person as both best and jinx (single eligible partner).
  if (jinxPartner && bestPartner && jinxPartner.partnerId === bestPartner.partnerId) {
    jinxPartner = null;
  }

  const totalBeers = totalRow[0]?.n ?? 0;
  const distinctSessions = sessionRow[0]?.n ?? 0;
  const owes = owesRow[0];

  return {
    memberId: me.id,
    displayName: me.displayName,
    avatarKey: me.avatarKey,
    avatarUploadAt: me.avatarUploadAt,
    matchesPlayed: played,
    won,
    lost,
    winRatio: played === 0 ? null : won / played,
    currentStreak: currentWinStreak(seq),
    bestStreak: bestWinStreak(seq),
    nemesis: pickNemesis(h2h),
    favouriteVictim: pickFavouriteVictim(h2h),
    bestPartner,
    jinxPartner,
    totalBeers,
    beersPerNight: beersPerNight(totalBeers, distinctSessions),
    favouriteBeer: favRow[0]
      ? { beerTypeId: favRow[0].beerTypeId, name: favRow[0].name, count: favRow[0].c }
      : null,
    roundsPoured: roundsRow[0]?.n ?? 0,
    distinctBeerTypes: beerTypeRow[0]?.n ?? 0,
    sessionsAttended: distinctSessions,
    tabMinor,
    lastWinAt,
    owesMostTo: owes ? { memberId: owes.toMemberId, ...withFace(owes.toMemberId), beerCount: owes.beers } : null,
  };
}
