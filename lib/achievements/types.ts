// Spec 035 + 038 — in-code shape the badge catalog, reconcile, and gallery share.
// Nothing here is persisted; the member_achievements table only stores
// (memberId, badgeKey, earnedAt).

import type { MemberStats } from '@/lib/stats/types';

export type BadgeKey =
  // Single (non-tiered) badges — spec 035.
  | 'sharpshooter'
  | 'onFire'
  | 'hatTrick'
  // Tiered families — bronze key is the ORIGINAL 035 key (backward-compatible),
  // silver/gold are spec-038 additive keys.
  | 'centuryClub'
  | 'centuryClubSilver'
  | 'centuryClubGold'
  | 'winner'
  | 'winnerSilver'
  | 'winnerGold'
  | 'regular'
  | 'regularSilver'
  | 'regularGold'
  | 'roundKing'
  | 'roundKingSilver'
  | 'roundKingGold'
  | 'nightOwl'
  | 'nightOwlSilver'
  | 'nightOwlGold'
  | 'connoisseur'
  | 'connoisseurSilver'
  | 'connoisseurGold';

// Spec 038 — tier levels for a count-based family.
export type Tier = 'bronze' | 'silver' | 'gold';

/** Progress toward a badge's goal, for the locked-state bar (FR-004). */
export interface BadgeProgress {
  /** Clamped to 0..target for display. */
  current: number;
  target: number;
}

// A single (non-tiered) badge — spec 035.
export interface Badge {
  key: BadgeKey;
  emoji: string;
  /** i18n keys under the `achievement.badge.<key>` namespace. */
  nameKey: string;
  descriptionKey: string;
  /** The unlock condition, shown for single badges (FR-002). */
  conditionKey: string;
  /** Pure predicate over the member's current stats. */
  earned: (stats: MemberStats) => boolean;
  /** Pure progress over the member's current stats (locked bar) — FR-004. */
  progress: (stats: MemberStats) => BadgeProgress;
}

// Spec 038 — one tier of a family.
export interface BadgeTier {
  tier: Tier;
  /** Persisted key. The bronze tier's key === the family's base key. */
  key: BadgeKey;
  threshold: number;
}

// Spec 038 — a tiered family over a single monotonic count stat.
export interface BadgeFamily {
  /** Base key (also the bronze key). */
  family: BadgeKey;
  emoji: string;
  nameKey: string;
  descriptionKey: string;
  conditionKey: string;
  /** The tracked count this family escalates over. */
  stat: (stats: MemberStats) => number;
  /** Ascending: bronze → silver → gold. */
  tiers: readonly [BadgeTier, BadgeTier, BadgeTier];
}

/** One tile in the gallery — a single badge, or a family at its highest tier. */
export interface BadgeView {
  key: BadgeKey;
  emoji: string;
  nameKey: string;
  /** Shown for single badges; omitted for families (the progress bar conveys it). */
  conditionKey?: string;
  /** Set for tiered families: the member's highest earned tier (or bronze when locked). */
  tier?: Tier;
  earned: boolean;
  /** Set when earned; null when locked. */
  earnedAt: Date | null;
  /** For the locked bar; reads complete when earned. */
  progress: BadgeProgress;
  // US3 rarity (optional). Holders within the club + the club's member total.
  holders?: number;
  clubMembers?: number;
}
