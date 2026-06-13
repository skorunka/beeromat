// Spec 035 — pure badge predicates (earned?) + progress (how close?), over the
// existing MemberStats shape. No I/O. Unit-tested in tests/unit. These mirror
// spec 034's lib/stats/* selectors: the catalog (catalog.ts) wires them to keys.

import type { MemberStats } from '@/lib/stats/types';
import { WINRATE_MIN_MATCHES } from '@/lib/stats/constants';
import type { BadgeProgress } from './types';

const SHARPSHOOTER_WIN_PCT = 60;

const clamp = (n: number, target: number): BadgeProgress => ({
  current: Math.min(Math.max(n, 0), target),
  target,
});

// --- earned predicates ---

export const isCenturyClub = (s: MemberStats) => s.totalBeers >= 100;
export const isWinner = (s: MemberStats) => s.won >= 25;
// best ≥ current always, so this covers "current OR best streak of 3+".
export const isHatTrick = (s: MemberStats) => s.bestStreak >= 3;
export const isOnFire = (s: MemberStats) => s.currentStreak >= 5;
export const isRoundKing = (s: MemberStats) => s.roundsPoured >= 10;
export const isRegular = (s: MemberStats) => s.matchesPlayed >= 25;
export const isSharpshooter = (s: MemberStats) =>
  s.matchesPlayed >= WINRATE_MIN_MATCHES &&
  s.winRatio !== null &&
  s.winRatio * 100 >= SHARPSHOOTER_WIN_PCT;
export const isConnoisseur = (s: MemberStats) => s.distinctBeerTypes >= 5;
export const isNightOwl = (s: MemberStats) => s.sessionsAttended >= 25;

// --- progress (for the locked bar) ---

export const progCenturyClub = (s: MemberStats) => clamp(s.totalBeers, 100);
export const progWinner = (s: MemberStats) => clamp(s.won, 25);
export const progHatTrick = (s: MemberStats) => clamp(s.bestStreak, 3);
export const progOnFire = (s: MemberStats) => clamp(s.currentStreak, 5);
export const progRoundKing = (s: MemberStats) => clamp(s.roundsPoured, 10);
export const progRegular = (s: MemberStats) => clamp(s.matchesPlayed, 25);
export const progConnoisseur = (s: MemberStats) => clamp(s.distinctBeerTypes, 5);
export const progNightOwl = (s: MemberStats) => clamp(s.sessionsAttended, 25);
// Two-leg goal: first reach the min-matches guard, then the 60% win rate. Show
// the gating leg — matches toward the guard, then win-% toward 60.
export const progSharpshooter = (s: MemberStats): BadgeProgress =>
  s.matchesPlayed < WINRATE_MIN_MATCHES
    ? clamp(s.matchesPlayed, WINRATE_MIN_MATCHES)
    : clamp(Math.round((s.winRatio ?? 0) * 100), SHARPSHOOTER_WIN_PCT);
