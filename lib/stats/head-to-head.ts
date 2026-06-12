// Spec 034 — pure nemesis / favourite-victim selection from a member's
// per-opponent record. Guarded by a minimum number of games together so a
// single fluke match doesn't crown a rival.

import { MIN_H2H_GAMES } from './constants';
import type { HeadToHead } from './types';

const games = (o: HeadToHead) => o.wins + o.losses;

/** The opponent who has beaten the member the most (≥1 loss, ≥minGames). */
export function pickNemesis(h2h: HeadToHead[], minGames = MIN_H2H_GAMES): HeadToHead | null {
  const eligible = h2h.filter((o) => games(o) >= minGames && o.losses > 0);
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) =>
      b.losses - a.losses || games(b) - games(a) || a.displayName.localeCompare(b.displayName),
  )[0]!;
}

/** The opponent the member has beaten the most (≥1 win, ≥minGames). */
export function pickFavouriteVictim(
  h2h: HeadToHead[],
  minGames = MIN_H2H_GAMES,
): HeadToHead | null {
  const eligible = h2h.filter((o) => games(o) >= minGames && o.wins > 0);
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) => b.wins - a.wins || games(b) - games(a) || a.displayName.localeCompare(b.displayName),
  )[0]!;
}
