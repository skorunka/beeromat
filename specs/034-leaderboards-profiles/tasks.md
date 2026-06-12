---
description: "Task list for feature 034 — Leaderboards + player profiles"
---

# Tasks: Leaderboards + player profiles

**Input**: Design documents from `specs/034-leaderboards-profiles/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — Principle VIII requires tests; plan declares unit (primary)
+ integration + component (E2E N/A). Tests land with the code they cover.

**Organization**: by user story (US1 boards → US2 profile → US3 fun-lines), each
an independent, shippable increment. Authored on `main` (trunk-based). Read-only
feature — no schema change, no migration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: may run in parallel (different file, no incomplete dependency).

---

## Phase 1: Setup

- [X] T001 Confirm the feature is additive (no `drizzle/` migration, no new
  dependency) and `pnpm typecheck` + `pnpm test` are green on `main` before
  starting (baseline for the gate diff).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, the win-streak primitive (used by both the streak
board and the profile), and the doubles data partner stats need.

**⚠️ CRITICAL**: complete before user-story work.

- [X] T002 [P] Create `lib/stats/types.ts`: `BoardKey`, `Scope`, `BoardRow`,
  `Leaderboard`, `HeadToHead`, `PartnerRecord`, `MemberStats`, `FunLine`
  (per data-model.md).
- [X] T003 [P] Create `lib/stats/streak.ts`: pure `currentWinStreak(results)` +
  `bestWinStreak(results)` over an oldest→newest `{ won: boolean }[]`
  (contracts/profile-stats.md).
- [X] T004 [P] Unit test `tests/unit/stats-streak.spec.ts`: empty, all-wins,
  all-losses, mixed (current = trailing wins; best = longest run).
- [X] T005 Extend `scripts/seed-heavy.ts` to also generate **doubles** matches:
  agreements with `pairingKind`, 4 `match_agreement_sides` (A1/A2/B1/B2), the
  per-loser↔winner `matches` rows the record-result model creates, and bet debts
  for for-beer doubles — so best/worst-partner stats have data. Re-run
  `pnpm db:reset:operational && pnpm db:seed:heavy` to validate it inserts.

**Checkpoint**: types + streak primitive + doubles data ready.

---

## Phase 3: User Story 1 - Club leaderboards (Priority: P1) 🎯 MVP

**Goal**: 7 ranked boards with all-time/season toggle, podium top-3, and the
viewer's own row highlighted.

**Independent Test**: On the seeded club, each board ranks the right members by
its metric (voided/reversed excluded), the win-rate board honours the ≥10 guard,
the season toggle recomputes time-based boards, and the viewer's row is marked.

### Implementation for User Story 1

- [X] T006 [US1] Create `lib/db/queries/leaderboards.ts` →
  `getLeaderboards({ clubId, viewerMemberId, scope, topN })` per
  contracts/leaderboard-queries.md: ONE aggregate `GROUP BY` per board
  (beers/tab/wins/played/winRate/streak/boughtForOthers), run via `Promise.all`,
  active members only, voided consumptions + reversed/cancelled/voided matches
  excluded, season = `created_at`/`played_at ≥ now-90d` (tab is current-state),
  win-rate ≥10 guard with `thresholdNote`, top-N rows + a `viewerRow` lookup,
  dense rank + displayName tie-break. Streak board = bounded match fetch folded
  with `currentWinStreak` (T003). NO per-member loops.
- [X] T007 [P] [US1] Integration test `tests/integration/leaderboards.spec.ts`:
  each board ranks correctly; a voided consumption + a reversed match don't
  count; the 90-day window changes results; the win-rate guard excludes a 1–0
  member; `viewerRow` resolves when the viewer is outside top-N; club-scoped.
- [X] T008 [P] [US1] Create `components/stats/leaderboard-board.tsx` (podium for
  top-3, ranked rows with `<MemberAvatar>` + value, **self-row highlight**,
  friendly empty state) and `components/stats/scope-toggle.tsx` (all-time /
  this-season segmented control as links to `?scope=…`).
- [X] T009 [US1] Create `app/[locale]/(app)/leaderboards/page.tsx`: read
  `?scope`, call `getLeaderboards`, render each board + the scope toggle; member
  rows link to `/members/[memberId]`.
- [X] T010 [US1] Add the Leaderboards entry point: a nav item in
  `components/nav/bottom-nav.tsx` (+ its server-side nav config in the (app)
  layout) and a link on the match hub `app/[locale]/(app)/match/page.tsx`.
- [X] T011 [US1] Add `stats.*` board copy to `messages/cs.json` + `messages/en.json`
  (board titles, scope labels all-time/season, win-rate threshold note, empty
  state) — cs/en parity, ICU where counts appear.
- [X] T012 [P] [US1] Component test
  `tests/component/leaderboard-board.spec.tsx` (+ scope-toggle): podium marks
  top-3, the viewer row is highlighted, empty state renders, toggle links carry
  the right `?scope`.

**Checkpoint**: Leaderboards work end to end — MVP shippable.

---

## Phase 4: User Story 2 - Player profile / stats (Priority: P2)

**Goal**: a per-member profile with record/streaks/nemesis+victim/best+jinx
partner/beer aggregates/tab.

**Independent Test**: On the seeded club (singles + doubles), a profile's record,
streaks, nemesis/victim, and best/jinx partner match hand-computed expectations,
with thresholds hiding small samples.

**Dependency**: needs the doubles seed (T005) + the streak primitive (T003).

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `lib/stats/head-to-head.ts` (`pickNemesis`,
  `pickFavouriteVictim`, min-games guard + tie-breaks) + unit test
  `tests/unit/stats-head-to-head.spec.ts`.
- [X] T014 [P] [US2] Create `lib/stats/partners.ts` (`pickBestPartner`,
  `pickJinxPartner`, guard) + unit test `tests/unit/stats-partners.spec.ts`.
- [X] T015 [P] [US2] Create `lib/stats/beers-per-night.ts` + unit test
  `tests/unit/stats-beers-per-night.spec.ts` (incl. 0-sessions → null).
- [X] T016 [US2] Create `lib/db/queries/player-stats.ts` →
  `getPlayerStats({ clubId, memberId })` per contracts/profile-stats.md:
  the member's non-voided match rows (winner/loser/opponent/playedAt/format),
  doubles agreement sides (partners), beer aggregates (total, distinct sessions,
  favourite beer, rounds poured), open bet debts (owes-most-to), and tab via
  `memberBalance`; assemble `MemberStats` using the T003/T013/T014/T015 selectors.
- [X] T017 [P] [US2] Integration test `tests/integration/player-stats.spec.ts`:
  correct played/won/lost + streak; nemesis = most-lost-to; a **doubles** partner
  record; voided/reversed excluded; guards return null on small samples; tab
  matches balance.
- [X] T018 [US2] Create `app/[locale]/(app)/members/[memberId]/page.tsx` (profile)
  + `components/stats/stat-tile.tsx` + `components/stats/head-to-head-card.tsx`;
  club-scope guard → `notFound()` for a foreign member.
- [X] T019 [US2] Wire profile entry points: member rows on the leaderboard +
  match lineup names/avatars link to `/members/[id]`, and add an own-profile
  link on `app/[locale]/(app)/account/page.tsx`.
- [X] T020 [US2] Add profile `stats.*` labels (played/won/lost/ratio/streak/
  nemesis/victim/partner/beersPerNight/favouriteBeer/roundsPoured/tab,
  placeholders) to `messages/{cs,en}.json`.
- [X] T021 [P] [US2] Component test `tests/component/profile.spec.tsx`: each
  section renders from mocked `MemberStats`; placeholders show when a stat is
  null.

**Checkpoint**: Profiles work; US1 still independently functional.

---

## Phase 5: User Story 3 - Playful fun-line engine (Priority: P3)

**Goal**: 1–2 data-driven playful lines on the profile (cs/en), warm not mean.

**Independent Test**: For crafted stats the engine selects the applicable lines
with correct params; a no-qualifying-stats member gets none.

### Implementation for User Story 3

- [X] T022 [P] [US3] Create `lib/stats/fun-lines.ts` → `selectFunLines(stats)`
  (pure, total, deterministic; `now` passed in for date-based lines) per
  contracts/fun-lines.md + unit test `tests/unit/stats-fun-lines.spec.ts`
  (each line's guard + params; empty for no qualifiers; ordering).
- [X] T023 [US3] Add the `funline.*` namespace (≥6 lines) to
  `messages/{cs,en}.json` with ICU plurals (cs few/other), warm/teasing copy.
- [X] T024 [US3] Create `components/stats/fun-line.tsx` (renders `t(key, params)`)
  and surface the top 1–2 on the profile page (T018); empty list → render nothing.
- [X] T025 [P] [US3] Component test `tests/component/fun-line.spec.tsx`: a line
  renders with filled params in cs + en (correct plural); empty → nothing.

**Checkpoint**: profiles delight; all three stories independent.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] If any `components/stats/*` or `lib/db/queries/{leaderboards,
  player-stats}.ts` trips the `i18n:check` arrow/generic false-positive, add it
  to the EXCLUDED set in `scripts/i18n-check.ts` with a one-line reason.
- [X] T027 Run the full gate suite — `pnpm typecheck`, `pnpm lint`, `pnpm test`
  (unit+integration+component+i18n:check+forms:check), `pnpm build` — fix any
  failure. (No E2E — declared N/A.)
- [X] T028 Execute `specs/034-leaderboards-profiles/quickstart.md` on the heavy
  dataset; sanity-check the leaderboards page feels instant (SQL-aggregated, no
  per-member loops) and the boards/profile/fun-lines read correctly.
- [X] T029 Flip CLAUDE.md's 034 note from "Currently planning" to "Most recently
  shipped" with the as-built summary.

---

## Dependencies & Execution Order

- **Setup (T001)** → no deps.
- **Foundational (T002–T005)** → blocks all stories. T002/T003 `[P]`; T004 after
  T003; T005 independent (different file).
- **US1 (T006–T012)** → after Foundational. T006 (query) and T008 (components)
  `[P]`; T009 depends on T006+T008; T010 depends on T009; tests `[P]`.
- **US2 (T013–T021)** → after Foundational (needs T005 doubles + T003 streak).
  T013/T014/T015 selectors `[P]`; T016 depends on them; T018 on T016; T019 on
  T018 + (US1's leaderboard rows, for the link).
- **US3 (T022–T025)** → after US2 (renders on the profile, T018/T024).
- **Polish (T026–T029)** → after the desired stories.

## Parallel Opportunities

- Foundational: T002 ‖ T003 ‖ T005.
- US1: T006 (query) ‖ T008 (components); tests T007 ‖ T012.
- US2: T013 ‖ T014 ‖ T015 (different selector files), then T016.
- Cross-story: US1 and US2 are largely parallel after Foundational (different
  files), except T019 links profile from the leaderboard rows.

## Implementation Strategy

### MVP first (US1 only)
1. T001 → T002–T005 (Foundational) → T006–T012 (US1).
2. **STOP and validate**: boards rank correctly, season toggle works, self-row
   highlighted (integration + component green; quickstart steps 1–2).
3. Ship the MVP.

### Incremental delivery
1. Foundation + US1 → ship (the boards — the headline value).
2. US2 → ship (player profiles).
3. US3 → ship (fun-lines — the joy layer).
4. Polish (T026–T029).

Each story is its own commit group referencing its task IDs + `US#`.

## Notes

- No schema change / migration; everything derives from existing tables.
- Leaderboard boards MUST be SQL-aggregated (one GROUP BY each, Promise.all) —
  never a per-member loop. The pure `lib/stats/*` selectors are the unit-test
  heartland.
- `[P]` = different file, no incomplete dependency.
- E2E intentionally omitted (plan.md declaration); do not add a Playwright spec.
