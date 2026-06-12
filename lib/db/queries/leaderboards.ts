import 'server-only';
import { and, asc, count, eq, gte, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matches, matchAgreements } from '@/lib/db/schema/matches';
import { getAllMemberBalances } from './payments';
import { currentWinStreak } from '@/lib/stats/streak';
import { SEASON_DAYS, WINRATE_MIN_MATCHES } from '@/lib/stats/constants';
import type { BoardKey, BoardRow, Leaderboard, MemberFace, Scope } from '@/lib/stats/types';

// Spec 034 — leaderboards. Each board is ONE aggregate (no per-member loop);
// the match-based boards (wins/played/winRate/streak) share a single bounded
// fetch of qualifying matches folded in JS. Voided consumptions + reversed/
// cancelled/voided matches are excluded everywhere. Season = rolling 90 days
// (tab is current-state, ignores scope).

const DEFAULT_TOP_N = 20;

interface Face extends MemberFace {
  memberId: string;
}

/** Build one board from member→value, with dense ranking + viewer row. */
function rankBoard(
  key: BoardKey,
  scope: Scope,
  values: Map<string, number>,
  faces: Map<string, Face>,
  viewerMemberId: string,
  topN: number,
  thresholdNote: string | null = null,
): Leaderboard {
  const sorted = [...values.entries()]
    .map(([memberId, value]) => ({ value, face: faces.get(memberId) }))
    .filter((e): e is { value: number; face: Face } => Boolean(e.face))
    .sort((a, b) => b.value - a.value || a.face.displayName.localeCompare(b.face.displayName));

  const ranked: BoardRow[] = [];
  let rank = 0;
  let prevValue: number | null = null;
  for (const e of sorted) {
    if (prevValue === null || e.value !== prevValue) {
      rank += 1; // dense rank — ties share, no gaps
      prevValue = e.value;
    }
    ranked.push({
      memberId: e.face.memberId,
      displayName: e.face.displayName,
      avatarKey: e.face.avatarKey,
      avatarUploadAt: e.face.avatarUploadAt,
      value: e.value,
      rank,
    });
  }
  return {
    key,
    scope,
    rows: ranked.slice(0, topN),
    viewerRow: ranked.find((r) => r.memberId === viewerMemberId) ?? null,
    thresholdNote,
  };
}

export async function getLeaderboards(args: {
  clubId: string;
  viewerMemberId: string;
  scope: Scope;
  topN?: number;
}): Promise<Leaderboard[]> {
  const topN = args.topN ?? DEFAULT_TOP_N;
  const cutoff = new Date(Date.now() - SEASON_DAYS * 24 * 60 * 60 * 1000);
  const seasonC = args.scope === 'season' ? gte(consumptions.createdAt, cutoff) : undefined;
  const seasonM = args.scope === 'season' ? gte(matches.playedAt, cutoff) : undefined;
  const buyer = alias(members, 'buyer');

  const [activeMembers, beerRows, boughtRows, matchList, balances] = await Promise.all([
    db
      .select({
        memberId: members.id,
        displayName: members.displayName,
        avatarKey: members.avatarKey,
        avatarUploadAt: members.avatarUploadAt,
      })
      .from(members)
      .where(and(eq(members.clubId, args.clubId), eq(members.isActive, true))),
    // beers drunk (non-voided)
    db
      .select({ memberId: consumptions.memberId, value: count() })
      .from(consumptions)
      .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
      .where(and(eq(consumptions.clubId, args.clubId), isNull(consumptionVoids.consumptionId), seasonC))
      .groupBy(consumptions.memberId),
    // beers bought for OTHERS — buyer = member whose user logged it, for someone else
    db
      .select({ memberId: buyer.id, value: count() })
      .from(consumptions)
      .innerJoin(
        buyer,
        and(eq(buyer.userId, consumptions.createdByUserId), eq(buyer.clubId, consumptions.clubId)),
      )
      .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
      .where(
        and(
          eq(consumptions.clubId, args.clubId),
          isNull(consumptionVoids.consumptionId),
          ne(consumptions.memberId, buyer.id),
          seasonC,
        ),
      )
      .groupBy(buyer.id),
    // qualifying matches (non-voided, non-reversed/cancelled) — folded in JS
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
          isNull(matches.voidedAt),
          isNull(matchAgreements.reversedAt),
          isNull(matchAgreements.cancelledAt),
          seasonM,
        ),
      )
      .orderBy(asc(matches.playedAt)),
    getAllMemberBalances(args.clubId),
  ]);

  const faces = new Map<string, Face>(activeMembers.map((m) => [m.memberId, m]));

  // Fold the match list into per-member wins / played / streak sequences.
  const wins = new Map<string, number>();
  const played = new Map<string, number>();
  const seq = new Map<string, { won: boolean }[]>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const push = (k: string, won: boolean) => {
    const s = seq.get(k) ?? [];
    s.push({ won });
    seq.set(k, s);
  };
  for (const m of matchList) {
    bump(wins, m.winner);
    bump(played, m.winner);
    bump(played, m.loser);
    push(m.winner, true);
    push(m.loser, false);
  }

  const winsValues = wins;
  const playedValues = played;
  const winRateValues = new Map<string, number>();
  for (const [memberId, p] of played) {
    if (p >= WINRATE_MIN_MATCHES) {
      winRateValues.set(memberId, Math.round(((wins.get(memberId) ?? 0) / p) * 100));
    }
  }
  const streakValues = new Map<string, number>();
  for (const [memberId, s] of seq) {
    const streak = currentWinStreak(s);
    if (streak > 0) streakValues.set(memberId, streak);
  }

  const beersValues = new Map(beerRows.map((r) => [r.memberId, r.value]));
  const boughtValues = new Map(boughtRows.map((r) => [r.memberId, r.value]));
  const tabValues = new Map(
    balances
      .filter((b) => b.isActive && b.balanceMinor > 0n)
      .map((b) => [b.memberId, Number(b.balanceMinor)]),
  );

  // thresholdNote is left null here — the page localizes the win-rate caption
  // from board.key + the exported WINRATE_MIN_MATCHES constant.
  return [
    rankBoard('beers', args.scope, beersValues, faces, args.viewerMemberId, topN),
    rankBoard('tab', args.scope, tabValues, faces, args.viewerMemberId, topN),
    rankBoard('wins', args.scope, winsValues, faces, args.viewerMemberId, topN),
    rankBoard('played', args.scope, playedValues, faces, args.viewerMemberId, topN),
    rankBoard('winRate', args.scope, winRateValues, faces, args.viewerMemberId, topN),
    rankBoard('streak', args.scope, streakValues, faces, args.viewerMemberId, topN),
    rankBoard('boughtForOthers', args.scope, boughtValues, faces, args.viewerMemberId, topN),
  ];
}
