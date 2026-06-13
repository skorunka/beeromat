# Contract: gallery sort/filter (spec 037)

## Pure logic (`lib/achievements/gallery-view.ts`)

```ts
export function applyGalleryView(views: BadgeView[], { filter, sort }: GalleryViewState): BadgeView[];
```

**Guarantees** (unit-tested):
- `{ filter: 'all', sort: 'default' }` → returns `views` **unchanged** (same order)
  — the default profile view is byte-identical to today (FR-007).
- `filter: 'earned'` → only `v.earned`; `filter: 'locked'` → only `!v.earned`.
- `sort: 'closest'` → locked badges ordered by `progress.current / progress.target`
  descending (nearest-to-unlock first); earned badges placed after.
- `sort: 'rarest'` → ascending `holders` (fewest first); ties keep catalog order;
  views without `holders` sort last / unaffected.
- Pure: no I/O, no mutation of the input array (returns a new array).
- `canSortByRarity(views)` → true iff at least one view has a numeric `holders`.

## Client component (`components/achievements/achievements-gallery.tsx`, "use client")

```tsx
export function AchievementsGallery({ views }: { views: BadgeView[] }) {
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [sort, setSort] = useState<GallerySort>('default');
  const shown = applyGalleryView(views, { filter, sort });
  // renders: a quiet control row (filter segmented chips + sort control) then the
  // BadgeChip grid over `shown`; an empty note (achievement.filterEmpty) when 0.
}
```

**Guarantees** (component-tested):
- All/Earned/Locked changes the rendered badge set without navigation.
- "Closest to unlock" reorders locked badges by progress.
- With no interaction the grid matches the default (all, default order).
- An empty filter result shows the friendly note, not a blank area.
- "Rarest" control is hidden when `canSortByRarity(views)` is false.

## Server component (`achievements-section.tsx`) — edit

Stays a server component: builds `BadgeView[]` (+ rarity) exactly as today, renders
the section header + earned count, then `<AchievementsGallery views={views} />`
instead of mapping `BadgeChip` directly. (BadgeChip + the grid move into the client
gallery; the server no longer renders the grid.)
