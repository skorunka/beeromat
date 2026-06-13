// Spec 035 + 038 — the badge catalog. Source of truth for WHAT badges exist. Lives
// in code, not the DB — member_achievements only stores which keys a member holds.
//
// Spec 038 — the six count-based badges are TIERED families (bronze/silver/gold).
// The bronze tier reuses the original 035 base key (e.g. 'centuryClub'), so every
// already-awarded row becomes bronze and silver/gold are purely additive keys —
// no migration, and reconcile/backfill grant the new tiers automatically.

import type { MemberStats } from '@/lib/stats/types';
import type { Badge, BadgeFamily, BadgeKey, Tier } from './types';
import * as p from './predicates';

const ik = (k: BadgeKey) => ({
  nameKey: `achievement.badge.${k}.name`,
  descriptionKey: `achievement.badge.${k}.desc`,
  conditionKey: `achievement.badge.${k}.condition`,
});

// Tiered families. Display order on the profile (earned float to the top in the UI).
export const BADGE_FAMILIES: readonly BadgeFamily[] = [
  {
    family: 'centuryClub',
    emoji: '💯',
    ...ik('centuryClub'),
    stat: (s) => s.totalBeers,
    tiers: [
      { tier: 'bronze', key: 'centuryClub', threshold: 100 },
      { tier: 'silver', key: 'centuryClubSilver', threshold: 250 },
      { tier: 'gold', key: 'centuryClubGold', threshold: 500 },
    ],
  },
  {
    family: 'winner',
    emoji: '🏆',
    ...ik('winner'),
    stat: (s) => s.won,
    tiers: [
      { tier: 'bronze', key: 'winner', threshold: 25 },
      { tier: 'silver', key: 'winnerSilver', threshold: 50 },
      { tier: 'gold', key: 'winnerGold', threshold: 100 },
    ],
  },
  {
    family: 'regular',
    emoji: '🎾',
    ...ik('regular'),
    stat: (s) => s.matchesPlayed,
    tiers: [
      { tier: 'bronze', key: 'regular', threshold: 25 },
      { tier: 'silver', key: 'regularSilver', threshold: 50 },
      { tier: 'gold', key: 'regularGold', threshold: 100 },
    ],
  },
  {
    family: 'roundKing',
    emoji: '🤝',
    ...ik('roundKing'),
    stat: (s) => s.roundsPoured,
    tiers: [
      { tier: 'bronze', key: 'roundKing', threshold: 10 },
      { tier: 'silver', key: 'roundKingSilver', threshold: 25 },
      { tier: 'gold', key: 'roundKingGold', threshold: 50 },
    ],
  },
  {
    family: 'nightOwl',
    emoji: '🦉',
    ...ik('nightOwl'),
    stat: (s) => s.sessionsAttended,
    tiers: [
      { tier: 'bronze', key: 'nightOwl', threshold: 25 },
      { tier: 'silver', key: 'nightOwlSilver', threshold: 50 },
      { tier: 'gold', key: 'nightOwlGold', threshold: 100 },
    ],
  },
  {
    family: 'connoisseur',
    emoji: '🍺',
    ...ik('connoisseur'),
    stat: (s) => s.distinctBeerTypes,
    tiers: [
      { tier: 'bronze', key: 'connoisseur', threshold: 5 },
      { tier: 'silver', key: 'connoisseurSilver', threshold: 10 },
      { tier: 'gold', key: 'connoisseurGold', threshold: 20 },
    ],
  },
];

// Single (non-tiered) badges — spec 035, unchanged. Win-rate + streaks don't model
// as a simple count family.
export const SINGLE_BADGES: readonly Badge[] = [
  { key: 'sharpshooter', emoji: '📈', ...ik('sharpshooter'), earned: p.isSharpshooter, progress: p.progSharpshooter },
  { key: 'onFire', emoji: '🔥', ...ik('onFire'), earned: p.isOnFire, progress: p.progOnFire },
  { key: 'hatTrick', emoji: '🎩', ...ik('hatTrick'), earned: p.isHatTrick, progress: p.progHatTrick },
];

/** All badge keys a member's CURRENT stats qualify for (families×tiers + singles). Pure. */
export function qualifyingBadgeKeys(stats: MemberStats): BadgeKey[] {
  const keys: BadgeKey[] = [];
  for (const f of BADGE_FAMILIES) {
    for (const t of f.tiers) if (f.stat(stats) >= t.threshold) keys.push(t.key);
  }
  for (const b of SINGLE_BADGES) if (b.earned(stats)) keys.push(b.key);
  return keys;
}

/** Display info for ANY persisted key (family tier or single) — for the chip + celebration. */
export interface BadgeDisplay {
  nameKey: string;
  emoji: string;
  tier?: Tier;
}
const DISPLAY: Record<string, BadgeDisplay> = (() => {
  const m: Record<string, BadgeDisplay> = {};
  for (const f of BADGE_FAMILIES) {
    for (const t of f.tiers) m[t.key] = { nameKey: f.nameKey, emoji: f.emoji, tier: t.tier };
  }
  for (const b of SINGLE_BADGES) m[b.key] = { nameKey: b.nameKey, emoji: b.emoji };
  return m;
})();

/** Resolve a key → {nameKey, emoji, tier?}. Unknown/retired keys return undefined. */
export function badgeDisplay(key: BadgeKey): BadgeDisplay | undefined {
  return DISPLAY[key];
}
