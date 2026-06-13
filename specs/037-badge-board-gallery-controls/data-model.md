# Data Model: Badge board + gallery controls (spec 037)

**No schema changes.** Both features read existing structures.

## Badges board — derived, no new entity

A new leaderboard value-map computed from the existing `member_achievements`
table (spec 035):

```text
badgesValues: Map<memberId, count>
  = SELECT member_id, COUNT(*) FROM member_achievements
    WHERE club_id = :clubId
    GROUP BY member_id          -- NO earned_at/season filter (all-time)
```

Fed through the existing `rankBoard('badges', scope, badgesValues, faces, viewer, topN)`
→ a `Leaderboard` exactly like the other 7. `BoardKey` gains the `'badges'` member.

## Changed type — `BoardKey` (`lib/stats/types.ts`)

```ts
export type BoardKey =
  | 'beers' | 'tab' | 'wins' | 'played' | 'winRate' | 'streak' | 'boughtForOthers'
  | 'badges';   // NEW (spec 037) — count of held achievements, all-time
```

## New code-side types — gallery view (`lib/achievements/gallery-view.ts`)

In-memory only (per-visit client state), not persisted:

```ts
import type { BadgeView } from './types';

export type GalleryFilter = 'all' | 'earned' | 'locked';
export type GallerySort = 'default' | 'closest' | 'rarest';

export interface GalleryViewState {
  filter: GalleryFilter;
  sort: GallerySort;
}

/** Pure: filter + reorder the already-built views. `default`+`all` = identity. */
export function applyGalleryView(views: BadgeView[], view: GalleryViewState): BadgeView[];

/** Whether the "rarest" option should be offered (views carry holder counts). */
export function canSortByRarity(views: BadgeView[]): boolean; // some view has `holders` defined
```

`BadgeView` (spec 035) already carries everything the sorts/filters need:
`earned`, `progress {current,target}`, optional `holders`. No new fields.

## i18n keys (new)

```text
stats.board.badges                 -- "Nejvíc odznaků" / "Most badges"
achievement.filterAll              -- "Vše" / "All"
achievement.filterEarned           -- "Získané" / "Earned"
achievement.filterLocked           -- "Zamčené" / "Locked"
achievement.sortDefault            -- "Výchozí" / "Default"
achievement.sortClosest            -- "Nejblíž k odemčení" / "Closest to unlock"
achievement.sortRarest             -- "Nejvzácnější" / "Rarest"
achievement.filterEmpty            -- friendly "nothing in this filter" note
```
(cs/en parity enforced by `pnpm i18n:check`; both edited components are already in
the EXCLUDED set for the arrow false-positive.)
