# Research: Tiered badges (spec 038)

## R1 — Key scheme (backward compatibility is the crux)

- **Decision**: The existing base key IS the bronze tier (`centuryClub` = bronze);
  add new `…Silver` / `…Gold` keys. Encoding: simple suffixed keys (camelCase) to
  match the existing `BadgeKey` style, not a `family:tier` string.
- **Rationale**: Spec 035 already persisted base keys (`centuryClub`, …) on dev + prod.
  Reusing them as bronze means: zero orphaned rows, zero migration, and the existing
  recognition/backfill grants the new tiers automatically. A new `family:tier` scheme
  would orphan the old rows and double-count on the Most-badges board.
- **Alternatives**: `family:tier` composite (rejected — orphans + board double-count);
  a new tiers table (rejected — schema change, unnecessary).

## R2 — Which badges are tiered

- **Decision**: The 6 count-based families: Century Club (beers), Winner (wins),
  Regular (matches), Round King (rounds), Night Owl (sessions), Connoisseur (distinct
  beer types). Sharpshooter (win-rate + guard) and the streaks (Hat-trick/On Fire) stay
  SINGLE (the existing `Badge` shape, unchanged).
- **Rationale**: Only "monotonic count" stats tier cleanly (each tier = a higher count).
  Win-rate isn't a count; streaks are already a 3-then-5 escalation as two badges. Keep
  v1 tight (spec out-of-scope).

## R3 — Deriving tier predicates/progress (avoid 12 hand-written fns)

- **Decision**: A family carries `stat: (s) => number` + ascending tier thresholds.
  `qualifyingBadgeKeys`: for each family, push every tier key whose `stat >= threshold`
  (cumulative falls out). Gallery progress: `current = stat(s)`, `target = next tier
  threshold above the highest earned` (or top threshold if maxed).
- **Rationale**: One generic rule covers all tiers — less code, uniformly testable. The
  single badges keep their bespoke `earned`/`progress` (win-rate guard, streak).

## R4 — Gallery family grouping

- **Decision**: A pure `buildGalleryViews(stats, earnedKeys, rarity)` returns ONE
  `BadgeView` per family (at `highestEarnedTier(earnedKeys)`, progress to next) + one
  per single badge. `BadgeView` gains optional `tier?: 'bronze'|'silver'|'gold'`.
- **Rationale**: Keeps the section/gallery rendering a flat `BadgeView[]` (so spec-037
  filter/sort + the grid work unchanged); only the build step groups tiers into families.
- **Sticky edge**: highest earned tier comes from the EARNED set (persisted), so a tier
  stays shown even if the stat later dropped; progress-to-next uses the live stat.

## R5 — Counting + the Most-badges board

- **Decision**: Gallery "N of M" counts families once (M = 6 families + 3 singles = 9,
  unchanged). The 037 "Most badges" board keeps counting `member_achievements` rows, so
  higher tiers raise a member's count (depth rewarded).
- **Rationale**: The header is a per-member "how many of the set" (families); the board
  is a relative ranking where rewarding depth is desirable + keeps 037's simple COUNT.

## R6 — Celebration naming

- **Decision**: `celebrateUnlocks` resolves a tier key via a new `badgeDisplay(key)` →
  `{nameKey, tier?, emoji}`; the toast reads "{family name} — {Tier} {emoji}" for tiers,
  unchanged for singles. Tier labels from `achievement.tier.{bronze,silver,gold}` (cs/en).
- **Rationale**: Reuses the existing toast path; only the display string gains a tier.

## R7 — Thresholds (FR-013)

- **Decision (starting, tune vs heavy seed)**: beers 100/250/500, wins 25/50/100,
  matches 25/50/100, rounds 10/25/50, sessions 25/50/100, beerTypes 5/10/20.
- **Note**: The base wins/matches thresholds are already unreachable on the current
  seed (max ~14 wins / 24 matches) — that's the pre-existing **base-threshold tuning**
  backlog item, NOT introduced here. Tiers sit on top; verify the tier UX on the beers
  family (reachable: silver many, gold none) on the seed.
