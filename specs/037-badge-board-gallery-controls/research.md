# Research: Badge board + gallery controls (spec 037)

## R1 — How to add the badges board (reuse vs. new)

- **Decision**: Reuse `getLeaderboards`'s exact pattern — add one query to the
  `Promise.all` (`COUNT(*) GROUP BY member_id` over `member_achievements`, club-
  scoped), build a `badgesValues` Map, and pass it through the existing `rankBoard`
  with key `'badges'`. Add `'badges'` to `BoardKey`, a 🏅 entry to the
  `leaderboard-board` BOARD map and the `board-select` chip list, and one i18n key.
- **Rationale**: Every board already flows through `rankBoard` (dense rank, viewer
  row, podium, top-N). The new board is just another value-map → zero new render
  code, one new aggregate.

## R2 — Season scope for badges

- **Decision**: The badges board is **all-time regardless of `?scope`**. The
  badge-count query has no `gte(earnedAt, cutoff)` filter.
- **Rationale**: Badges are sticky and most were backfilled with a single release
  `earned_at` stamp, so a rolling-90-day count would be meaningless/misleading. The
  board stays visible under the season toggle (don't hide it) but shows the true
  all-time count. (Other boards' season filtering keys off consumption/match dates;
  the badge board simply opts out.)
- **Alternatives**: hide the board on season (rejected — surprising disappearance);
  filter by `earned_at` window (rejected — misleading given backfill stamping).

## R3 — Zero-badge members

- **Decision**: Omit them (the GROUP BY only returns members with ≥1 badge).
- **Rationale**: Identical to the streak board (`streak > 0` only) and win-rate
  board (guard) — `rankBoard` only ranks members present in the value Map. No
  special "0 badges" rows.

## R4 — Gallery controls: where the logic + state live

- **Decision**: Pure `applyGalleryView(views, {filter, sort})` in
  `lib/achievements/gallery-view.ts` (unit-tested); a thin CLIENT component
  `AchievementsGallery` holds the `useState` filter/sort + renders the result;
  `AchievementsSection` stays a SERVER component that assembles `BadgeView[]`
  (+ rarity) and passes it down.
- **Rationale**: Keeps data assembly server-side (no "use client" creep over the
  whole profile), keeps the reshuffle logic pure + tested, and `BadgeView[]`
  (incl. `earnedAt: Date`) serializes across the RSC boundary fine in Next 16.
- **Default identity**: `applyGalleryView(views, {filter:'all', sort:'default'})`
  MUST return `views` in the same order the section builds today (earned-first,
  then catalog order) — so the untouched view is byte-identical (FR-007). The
  section keeps doing today's sort; `default` is a pass-through.

## R5 — Sort definitions

- **Decision**:
  - `default` — pass-through (earned-first, then catalog order) = today's view.
  - `closest` — LOCKED badges by progress ratio `current/target` descending
    (nearest to unlock first); earned badges sort after (they're complete).
  - `rarest` — by `holders` ascending (fewest holders = rarest first); ties keep
    catalog order. Hidden when `holders` is absent on the views.
- **Rationale**: matches the spec's intent; all derived from fields already on
  `BadgeView` (`progress`, `holders`). Pure + unit-testable.

## R6 — Filter definitions

- **Decision**: `all` (everything), `earned` (`earned === true`), `locked`
  (`earned === false`). Empty result → the section's existing friendly empty note.

## R7 — Controls styling

- **Decision**: Reuse the segmented-chip look from `scope-toggle` / `board-select`
  — a compact filter segmented control + a small sort control, in one quiet row
  above the grid. Mobile-first, no new visual language.
