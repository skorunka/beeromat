// Spec 034 — pure best / jinx (worst) doubles-partner selection by win rate
// together, guarded by a minimum number of games as a pair.

import { MIN_PARTNER_GAMES } from './constants';
import type { PartnerRecord } from './types';

const rate = (p: PartnerRecord) => p.wins / p.games;

/** Highest win-rate partner (≥minGames together). */
export function pickBestPartner(
  partners: PartnerRecord[],
  minGames = MIN_PARTNER_GAMES,
): PartnerRecord | null {
  const eligible = partners.filter((p) => p.games >= minGames);
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) => rate(b) - rate(a) || b.games - a.games || a.displayName.localeCompare(b.displayName),
  )[0]!;
}

/** Lowest win-rate partner (≥minGames together) — the jinx. */
export function pickJinxPartner(
  partners: PartnerRecord[],
  minGames = MIN_PARTNER_GAMES,
): PartnerRecord | null {
  const eligible = partners.filter((p) => p.games >= minGames);
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) => rate(a) - rate(b) || b.games - a.games || a.displayName.localeCompare(b.displayName),
  )[0]!;
}
