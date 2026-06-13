// Spec 034 — the fun-line engine. Pure + total: given a member's stats,
// return the qualifying playful lines, spiciest first. The profile renders
// the top 1–2 via t(key, params). Warm/teasing, never mean. No randomness,
// no Date.now — deterministic, so it's fully unit-tested.

import type { FunLine, MemberStats } from './types';

export function selectFunLines(
  stats: MemberStats,
  opts: { isOwnProfile?: boolean } = {},
): FunLine[] {
  const lines: FunLine[] = [];

  // A one-sided rivalry is the funniest — lead with it.
  if (stats.nemesis && stats.nemesis.wins === 0 && stats.nemesis.losses >= 5) {
    lines.push({
      key: 'funline.subscription',
      params: { wins: stats.nemesis.wins, losses: stats.nemesis.losses, name: stats.nemesis.displayName },
    });
  }
  if (stats.currentStreak >= 3) {
    lines.push({ key: 'funline.undefeated', params: { count: stats.currentStreak } });
  }
  // "Pay up!" is a self-nudge in the second person — only on your OWN profile.
  // On someone else's profile the imperative makes no sense, so we skip it.
  if (opts.isOwnProfile && stats.owesMostTo && stats.owesMostTo.beerCount >= 2) {
    lines.push({
      key: 'funline.payUp',
      params: { count: stats.owesMostTo.beerCount, name: stats.owesMostTo.displayName },
    });
  }
  if (stats.roundsPoured >= 10) {
    lines.push({ key: 'funline.sugarDaddy', params: { count: stats.roundsPoured } });
  }
  if (stats.beersPerNight !== null && stats.beersPerNight >= 3) {
    lines.push({ key: 'funline.professional', params: { avg: stats.beersPerNight } });
  }
  if (stats.favouriteBeer && stats.favouriteBeer.count >= 10) {
    lines.push({
      key: 'funline.favouriteBeer',
      params: { beer: stats.favouriteBeer.name, count: stats.favouriteBeer.count },
    });
  }

  return lines;
}
