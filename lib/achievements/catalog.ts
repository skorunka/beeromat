// Spec 035 — the v1 badge catalog. Source of truth for WHAT badges exist (keys,
// emoji, i18n keys, earn predicate, progress fn). Lives in code, not the DB — the
// member_achievements table only stores which keys a member holds. Adding a badge
// is a code change here, never a migration.

import type { MemberStats } from '@/lib/stats/types';
import type { Badge, BadgeKey } from './types';
import * as p from './predicates';

const key = (k: BadgeKey) => ({
  nameKey: `achievement.badge.${k}.name`,
  descriptionKey: `achievement.badge.${k}.desc`,
  conditionKey: `achievement.badge.${k}.condition`,
});

// Array order = on-profile display order (earned float to the top in the UI;
// within each group this catalog order holds). Rough prestige/fun order.
export const BADGES: readonly Badge[] = [
  { key: 'centuryClub', emoji: '💯', ...key('centuryClub'), earned: p.isCenturyClub, progress: p.progCenturyClub },
  { key: 'winner', emoji: '🏆', ...key('winner'), earned: p.isWinner, progress: p.progWinner },
  { key: 'sharpshooter', emoji: '📈', ...key('sharpshooter'), earned: p.isSharpshooter, progress: p.progSharpshooter },
  { key: 'onFire', emoji: '🔥', ...key('onFire'), earned: p.isOnFire, progress: p.progOnFire },
  { key: 'hatTrick', emoji: '🎩', ...key('hatTrick'), earned: p.isHatTrick, progress: p.progHatTrick },
  { key: 'roundKing', emoji: '🤝', ...key('roundKing'), earned: p.isRoundKing, progress: p.progRoundKing },
  { key: 'regular', emoji: '🎾', ...key('regular'), earned: p.isRegular, progress: p.progRegular },
  { key: 'connoisseur', emoji: '🍺', ...key('connoisseur'), earned: p.isConnoisseur, progress: p.progConnoisseur },
  { key: 'nightOwl', emoji: '🦉', ...key('nightOwl'), earned: p.isNightOwl, progress: p.progNightOwl },
];

export const BADGE_BY_KEY: Record<BadgeKey, Badge> = Object.fromEntries(
  BADGES.map((b) => [b.key, b]),
) as Record<BadgeKey, Badge>;

/** All badge keys a member's CURRENT stats qualify for. Pure. */
export function qualifyingBadgeKeys(stats: MemberStats): BadgeKey[] {
  const keys: BadgeKey[] = [];
  for (const b of BADGES) if (b.earned(stats)) keys.push(b.key);
  return keys;
}
