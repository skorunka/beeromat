# Data Model: Tiered badges (spec 038)

**No schema change.** Tiers are additive `badge_key` values in the existing
`member_achievements` table (spec 035). The bronze tier reuses the existing base key.

## Persisted keys (existing table, additive)

| Family | bronze (existing) | silver (new) | gold (new) | thresholds (start) |
|---|---|---|---|---|
| Century Club | `centuryClub` | `centuryClubSilver` | `centuryClubGold` | 100 / 250 / 500 beers |
| Winner | `winner` | `winnerSilver` | `winnerGold` | 25 / 50 / 100 wins |
| Regular | `regular` | `regularSilver` | `regularGold` | 25 / 50 / 100 matches |
| Round King | `roundKing` | `roundKingSilver` | `roundKingGold` | 10 / 25 / 50 rounds |
| Night Owl | `nightOwl` | `nightOwlSilver` | `nightOwlGold` | 25 / 50 / 100 sessions |
| Connoisseur | `connoisseur` | `connoisseurSilver` | `connoisseurGold` | 5 / 10 / 20 beer types |

Singles (unchanged, single-level): `sharpshooter`, `hatTrick`, `onFire`.

## Code types (`lib/achievements/types.ts`)

```ts
export type Tier = 'bronze' | 'silver' | 'gold';

// BadgeKey union gains the 12 new …Silver / …Gold keys (still a string union).

export interface BadgeTier {
  tier: Tier;
  key: BadgeKey;        // bronze.key === the family's base key
  threshold: number;
}

export interface BadgeFamily {
  family: BadgeKey;     // base key (= bronze key)
  emoji: string;
  nameKey: string;      // achievement.badge.<family>.name  (existing)
  descriptionKey: string;
  conditionKey: string; // existing base condition (still shown on the tile)
  stat: (s: MemberStats) => number;   // the tracked count
  tiers: [BadgeTier, BadgeTier, BadgeTier]; // ascending bronze→silver→gold
}

// BadgeView (035) gains an optional tier for the family tile:
export interface BadgeView {
  // …existing fields…
  tier?: Tier;          // set for tiered families (the highest earned, or bronze when locked)
}
```

## Catalog (`lib/achievements/catalog.ts`)

- `BADGE_FAMILIES: BadgeFamily[]` (6) — source of truth for tiers.
- `SINGLE_BADGES: Badge[]` (3) — sharpshooter, hatTrick, onFire (035, unchanged).
- Derived: `qualifyingBadgeKeys(stats)` (families×tiers met + singles earned),
  `BADGE_BY_KEY` (incl. tier keys → for display), `badgeDisplay(key) → {nameKey, tier?, emoji}`.

## Gallery view (`lib/achievements/family-view.ts`)

```ts
export function highestEarnedTier(earnedKeys: Set<BadgeKey>, family: BadgeFamily): Tier | null;
export function buildGalleryViews(
  stats: MemberStats,
  earned: { key: BadgeKey; earnedAt: Date }[],
  rarity?: { holdersByKey: Record<string, number>; clubMembers: number } | null,
): BadgeView[];   // one per family (at highest tier + progress to next) + one per single
```

## i18n (new)

```text
achievement.tier.bronze   -- "Bronz" / "Bronze"
achievement.tier.silver   -- "Stříbro" / "Silver"
achievement.tier.gold     -- "Zlato" / "Gold"
```
Per-family name/desc/condition keys are unchanged (reused for all tiers; the tier label
is appended in the UI + celebration).
