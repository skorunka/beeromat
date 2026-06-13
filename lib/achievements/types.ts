// Spec 035 — in-code shape the badge catalog, reconcile, and gallery share.
// Nothing here is persisted; the member_achievements table only stores
// (memberId, badgeKey, earnedAt).

import type { MemberStats } from '@/lib/stats/types';

export type BadgeKey =
  | 'centuryClub'
  | 'winner'
  | 'sharpshooter'
  | 'onFire'
  | 'hatTrick'
  | 'roundKing'
  | 'regular'
  | 'connoisseur'
  | 'nightOwl';

/** Progress toward a badge's goal, for the locked-state bar (FR-004). */
export interface BadgeProgress {
  /** Clamped to 0..target for display. */
  current: number;
  target: number;
}

export interface Badge {
  key: BadgeKey;
  emoji: string;
  /** i18n keys under the `achievement.badge.<key>` namespace. */
  nameKey: string;
  descriptionKey: string;
  /** The unlock condition, shown for EVERY badge (earned + locked) — FR-002. */
  conditionKey: string;
  /** Pure predicate over the member's current stats. */
  earned: (stats: MemberStats) => boolean;
  /** Pure progress over the member's current stats (locked bar) — FR-004. */
  progress: (stats: MemberStats) => BadgeProgress;
}

/** One badge row in the gallery, joined with the member's earned set + stats. */
export interface BadgeView {
  key: BadgeKey;
  emoji: string;
  earned: boolean;
  /** Set when earned; null when locked. */
  earnedAt: Date | null;
  /** For the locked bar; reads complete when earned. */
  progress: BadgeProgress;
  // US3 rarity (optional). Holders within the club + the club's member total.
  holders?: number;
  clubMembers?: number;
}
