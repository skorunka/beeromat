# Implementation Plan: Badge leaderboard + gallery sort/filter

**Branch**: `main` (trunk-based) | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/037-badge-board-gallery-controls/spec.md`

## Summary

Two achievements follow-ups on top of specs 034 + 035, **no schema change**:

1. **"Most badges" board** — an 8th leaderboard. `getLeaderboards` gains one
   `COUNT(*) GROUP BY member_id` over `member_achievements` (club-scoped, **no
   season filter** — all-time always), fed through the existing `rankBoard`. Add
   `'badges'` to the `BoardKey` union, a 🏅 entry to the `leaderboard-board` BOARD
   map + the `board-select` chip strip, and `stats.board.badges` i18n.
2. **Gallery sort/filter** — extract a pure `applyGalleryView(views, {filter, sort})`
   into `lib/achievements/gallery-view.ts` (unit-tested), and split a small CLIENT
   child `AchievementsGallery` off `AchievementsSection` (which stays a server
   component that builds `BadgeView[]`). The client child holds the filter
   (All/Earned/Locked) + sort (Default/Rarest/Closest) state and renders the
   filtered/sorted `BadgeChip` grid + empty state. Pure client reshuffle of data
   already passed down — no new query, no fetch.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19.2, Next.js 16 (App Router)
**Primary Dependencies**: Drizzle (one new GROUP BY), next-intl v4, existing
`rankBoard`/`Leaderboard`/`BoardRow` (034), `BadgeView`/`BadgeChip` (035), the
chip styling from `scope-toggle`/`board-select`.
**Storage**: Neon — **no schema change**. Badge board = aggregate over existing
`member_achievements` (035). Gallery controls = client state, no storage.
**Testing**: unit (pure `applyGalleryView`), integration (badges board ranking,
PGlite), component (gallery controls + the 🏅 board chip). No E2E.
**Performance**: +1 GROUP BY in the existing `Promise.all` (negligible). Gallery
controls are client-only, no fetch.
**Constraints**: badges board is all-time even under `?scope=season` (FR-004);
the gallery default view must be byte-identical to today (FR-007).
**Scale/Scope**: ~3 small edits (types, query, two chip maps) + 1 new pure module
+ 1 new client component + 1 section split + i18n + tests.

## Constitution Check

- **I. Mobile-First** — ✅ gallery controls are chip/segmented, finger-sized; board reuses existing mobile layout.
- **II. Tenant-Aware / single-club** — ✅ badge board query filters `club_id`; club-scoped.
- **III–VII** — ✅ no money/auth/infra/dep changes; no data writes (read-only board + client state).
- **VIII. Testing Pyramid** — ✅ see declaration.
- **Test/Prod separation** — ✅ no test-only branches.

**No violations.**

### Test layer declaration

- **Unit (`pnpm test:unit`)** — **Yes.** `applyGalleryView(views, {filter, sort})`
  is a pure function (filter All/Earned/Locked; sort default/rarest/closest) →
  the natural home, like the other `lib/` selectors. Bulk of the gallery coverage.
- **Integration (`pnpm test:integration`)** — **Yes.** The badges board is a new
  DB aggregate: ranks members by held-badge count, club-scoped, viewer row, and
  is all-time under both scopes. Reuse the `leaderboards.spec` harness (PGlite).
- **Component (`pnpm test:component`)** — **Yes.** `AchievementsGallery`: the
  filter switches the rendered set; "closest" orders locked by progress; default
  unchanged; empty state. Plus a 🏅-chip assertion added to `board-select.spec`.
- **E2E** — N/A. A read-only board + client-side reshuffle; not a new journey
  (consistent with 034/035).

## Project Structure

```text
specs/037-badge-board-gallery-controls/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/{badge-board,gallery-view}.md
└── checklists/requirements.md

lib/stats/types.ts                         # EDIT — add 'badges' to BoardKey.
lib/db/queries/leaderboards.ts             # EDIT — +1 query (COUNT over member_achievements,
                                           #   no season filter) + rankBoard('badges', …).
components/stats/leaderboard-board.tsx      # EDIT — BOARD map += badges: 🏅 (board.badges).
components/stats/board-select.tsx           # EDIT — BOARDS += { key:'badges', emoji:'🏅' }.

lib/achievements/gallery-view.ts            # NEW — GalleryFilter/GallerySort types +
                                           #   pure applyGalleryView(views, view): BadgeView[].
components/achievements/achievements-gallery.tsx  # NEW (client) — filter/sort chip controls +
                                           #   the filtered/sorted BadgeChip grid + empty state.
components/achievements/achievements-section.tsx  # EDIT — stays server: builds BadgeView[] +
                                           #   header/count, renders <AchievementsGallery views=…/>.

messages/{cs,en}.json                       # EDIT — stats.board.badges + achievement.filter*/sort*.

tests/unit/achievement-gallery-view.spec.ts        # NEW
tests/integration/leaderboards-badges.spec.ts      # NEW (or extend leaderboards.spec)
tests/component/achievements-gallery.spec.tsx      # NEW
tests/component/board-select.spec.tsx              # EDIT — assert the 🏅 badges chip
```

**Structure Decision**: Keep `AchievementsSection` server-side (it owns the data
assembly + rarity) and push ONLY the interactive controls + grid into a client
child `AchievementsGallery`. `BadgeView[]` (incl. `earnedAt: Date`) passes across
the RSC boundary fine. The sort/filter logic is a pure `lib/` function so it's
unit-tested and the client component stays thin. The badges board reuses 100% of
the existing board machinery — only a new value-map + label/emoji.

### Key decisions (from research)

- **Badges board ignores `?scope`**: the badge-count query has NO `gte(earnedAt, cutoff)`
  filter, so the values are all-time under both all-time and season (FR-004). The
  board still renders under the season toggle, just with all-time numbers (no
  misleading rolling count; badges are sticky/backfill-stamped).
- **Zero-badge members are absent** from the GROUP BY → omitted from the board,
  exactly like the streak board (streak>0 only). No special-casing.
- **"Rarest first"** uses the `holders` already on `BadgeView` (035 rarity, loaded
  by the profile). If `holders` is undefined the option is hidden (no-op guard).

## Complexity Tracking

> No violations — table intentionally empty.
