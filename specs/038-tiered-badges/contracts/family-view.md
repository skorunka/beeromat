# Contract: gallery family view (spec 038)

## Pure (`lib/achievements/family-view.ts`)

```ts
export function highestEarnedTier(earned: Set<BadgeKey>, family: BadgeFamily): Tier | null;

export function buildGalleryViews(
  stats: MemberStats,
  earned: { key: BadgeKey; earnedAt: Date }[],
  rarity?: { holdersByKey: Record<string, number>; clubMembers: number } | null,
): BadgeView[];
```

**`buildGalleryViews` guarantees** (unit-tested) — one entry per family + one per single:

For a **family**:
- `tier` = highest earned tier (from `earned`), or `null`/bronze-locked when none earned.
- `earned` = (highest tier !== null).
- `earnedAt` = the earnedAt of the highest earned tier key.
- `progress` = `{ current: stat(stats), target: <next tier threshold above highest earned> }`;
  when gold is earned → target = gold threshold and current ≥ target (renders complete).
  When nothing earned → target = bronze threshold (progress toward bronze).
- `emoji` / `nameKey` / `conditionKey` = the family's.
- optional `holders`/`clubMembers` from rarity (highest tier's key, or the base key).

For a **single** badge: identical to spec 035 (earned/locked, progress to its threshold,
no `tier`).

Ordering: families + singles in catalog order; the section still applies its default
earned-first sort, and spec-037 `applyGalleryView` still reshuffles the result.

## Chip (`badge-chip.tsx`) — edit

When `tier` is set, render a small tier cue (bronze/silver/gold pill or 🥉🥈🥇) and append
the tier label (`achievement.tier.<tier>`) to the family name — e.g. "Century Club — Silver".
Locked-bronze and single badges render as today (no tier cue / "— Tier" when not set).

**Guarantees** (component-tested):
- A family at 372 beers (silver earned, gold not) → tile shows Silver + "372 / 500".
- A family at 80 beers → locked Bronze + "80 / 100".
- A maxed family (≥ gold) → Gold, complete (no next-tier bar).
- A single badge → unchanged from 035.

## Section (`achievements-section.tsx`) — edit

Replace the inline per-`BADGE` view build with `buildGalleryViews(stats, earned, rarity)`;
pass the result to `<AchievementsGallery>` (037). "N of M" count = families with a tier
earned + earned singles, over `BADGE_FAMILIES.length + SINGLE_BADGES.length` (= 9).
