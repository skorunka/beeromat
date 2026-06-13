---
description: "Task list for spec 037 — badge leaderboard + gallery sort/filter"
---

# Tasks: Badge leaderboard + gallery sort/filter

**Input**: Design documents from `specs/037-badge-board-gallery-controls/`

**Tests**: unit + integration + component (per plan); no E2E.

**Organization**: US1 = Most-badges board (MVP). US2 = gallery filter/sort. Independent (different files). Authored on `main`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm clean tree on `main`; dev DB has badges (035 backfill on the heavy seed) so both surfaces have data.

---

## Phase 2: Foundational

*None — no shared infra/schema. The two stories touch disjoint files.*

---

## Phase 3: User Story 1 — "Most badges" leaderboard board (Priority: P1) 🎯 MVP

**Goal**: An 8th 🏅 board ranks members by held-badge count (all-time, club-scoped), selectable from the board switcher, same presentation as other boards.

**Independent Test**: On a seeded club, the badges board ranks members by badge count; identical under all-time/season; viewer row surfaced.

- [X] T002 [US1] Add `'badges'` to the `BoardKey` union in `lib/stats/types.ts`.
- [X] T003 [US1] In `lib/db/queries/leaderboards.ts`: import `memberAchievements`; add a `COUNT(*) GROUP BY member_id` query (club-scoped, NO season filter) to the `Promise.all`; build `badgesValues` Map; append `rankBoard('badges', args.scope, badgesValues, faces, args.viewerMemberId, topN)` to the returned array. Per contracts/badge-board.md.
- [X] T004 [P] [US1] In `components/stats/leaderboard-board.tsx`, add `badges: { key: 'board.badges', emoji: '🏅' }` to the `BOARD` map (formatValue falls through to `String(value)` — no change needed).
- [X] T005 [P] [US1] In `components/stats/board-select.tsx`, append `{ key: 'badges', emoji: '🏅' }` to `BOARDS`.
- [X] T006 [P] [US1] Add `stats.board.badges` to `messages/{cs,en}.json` ("Nejvíc odznaků" / "Most badges").
- [X] T007 [US1] Integration test `tests/integration/leaderboards-badges.spec.ts` (PGlite, reuse the leaderboards harness): seed members with differing `member_achievements` counts → badges board ranks by count desc, dense rank, club-scoped, viewer row; same result under scope 'allTime' and 'season'; zero-badge member omitted. (Gate: `pnpm test:integration`.)
- [X] T008 [P] [US1] Extend `tests/component/board-select.spec.tsx`: the 🏅 badges chip renders and links to `?board=badges` (scope preserved). (Gate: `pnpm test:component`.)

**Checkpoint**: /leaderboards has a working Most-badges board.

---

## Phase 4: User Story 2 — Gallery filter + sort (Priority: P2)

**Goal**: The profile achievements gallery gains All/Earned/Locked filter + Default/Closest/Rarest sort; default view unchanged; client-only.

**Independent Test**: On a profile, filter Earned/Locked/All re-renders the set; "Closest" orders locked by progress; default matches today.

- [X] T009 [P] [US2] Create `lib/achievements/gallery-view.ts` — `GalleryFilter`/`GallerySort`/`GalleryViewState` types + pure `applyGalleryView(views, view)` (default+all = identity; earned/locked filter; closest = locked by progress ratio desc then earned; rarest = holders asc, hidden-capable) + `canSortByRarity(views)`. Per contracts/gallery-view.md.
- [X] T010 [P] [US2] Unit test `tests/unit/achievement-gallery-view.spec.ts` — default+all returns input order; earned/locked filters; closest orders locked by progress; rarest by holders asc; pure (no input mutation); canSortByRarity true only with holders. (Gate: `pnpm test:unit`.)
- [X] T011 [US2] Create `components/achievements/achievements-gallery.tsx` (`'use client'`) — `useState` filter+sort, segmented filter chips (All/Earned/Locked) + a sort control (Default/Closest/Rarest, Rarest hidden when `!canSortByRarity`), renders `applyGalleryView(views, …)` as the `BadgeChip` grid + `achievement.filterEmpty` empty note. Reuse the scope-toggle/board-chip styling. Strings via `useTranslations('achievement')`. (Depends on T009.)
- [X] T012 [US2] Edit `components/achievements/achievements-section.tsx` — keep it a server component building `BadgeView[]` (+ rarity) + the header/count; replace the inline `BadgeChip` grid with `<AchievementsGallery views={sortedViews} />`. (Depends on T011.)
- [X] T013 [P] [US2] Add `achievement.filterAll/filterEarned/filterLocked`, `achievement.sortDefault/sortClosest/sortRarest`, `achievement.filterEmpty` to `messages/{cs,en}.json`. Add `achievements-gallery.tsx` to the i18n-check EXCLUDED set if the arrow regex false-positives.
- [X] T014 [US2] Component test `tests/component/achievements-gallery.spec.tsx` — All/Earned/Locked filters the rendered chips; Closest reorders locked by progress; default shows everything in input order; empty filter shows the note. (Gate: `pnpm test:component`.)

**Checkpoint**: profile gallery has working filter + sort; default view unchanged.

---

## Phase 5: Polish & Cross-Cutting

- [X] T015 Run gates: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`.
- [ ] T016 Live-walk quickstart.md via the Docker MCP browser — badges board ranks + all-time under both scopes; gallery filter/sort; default unchanged.
- [ ] T017 [P] Update `BACKLOG.md` (mark this item shipped) + flip `CLAUDE.md` SPECKIT marker 037 ACTIVE → shipped once validated.

---

## Dependencies & Execution Order

- Setup → US1 / US2 (independent, different files; either order or parallel).
- US1: T002→T003 (types before query); T004/T005/T006/T008 parallel; T007 after T003.
- US2: T009→T010 (pure+test); T011→T012 (component then wire); T013 parallel; T014 after T011.
- Polish after the desired stories.

## Implementation Strategy

MVP = US1 (the competitive board). Then US2 (gallery browsing). Ship both together,
gates, live-walk, then the milestone validation checkpoint before push/deploy.

## Notes

- No schema change; badges board is one extra GROUP BY. Gallery is client-only.
- Default gallery view MUST stay byte-identical (applyGalleryView default+all = identity).
- Don't re-test the existing 7 boards — the integration test targets only the new badges board.
