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

// Spec 038 — the count-based badges (Century Club, Winner, Regular, Round King,
// Night Owl, Connoisseur) are now TIERED FAMILIES whose earn/progress derive
// generically from (stat selector, tier thresholds) in catalog.ts + family-view.ts,
// so they no longer need per-badge predicate fns here. Only the SINGLE badges
// (win-rate + streaks) keep bespoke predicates:

// --- single-badge earned predicates ---

// best ≥ current always, so this covers "current OR best streak of 3+".
export const isHatTrick = (s: MemberStats) => s.bestStreak >= 3;
export const isOnFire = (s: MemberStats) => s.currentStreak >= 5;
export const isSharpshooter = (s: MemberStats) =>
  s.matchesPlayed >= WINRATE_MIN_MATCHES &&
  s.winRatio !== null &&
  s.winRatio * 100 >= SHARPSHOOTER_WIN_PCT;

// --- single-badge progress (for the locked bar) ---

export const progHatTrick = (s: MemberStats) => clamp(s.bestStreak, 3);
export const progOnFire = (s: MemberStats) => clamp(s.currentStreak, 5);
// Two-leg goal: first reach the min-matches guard, then the 60% win rate. Show
// the gating leg — matches toward the guard, then win-% toward 60.
export const progSharpshooter = (s: MemberStats): BadgeProgress =>
  s.matchesPlayed < WINRATE_MIN_MATCHES
    ? clamp(s.matchesPlayed, WINRATE_MIN_MATCHES)
    : clamp(Math.round((s.winRatio ?? 0) * 100), SHARPSHOOTER_WIN_PCT);
