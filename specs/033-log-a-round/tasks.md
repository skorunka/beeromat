---
description: "Task list for feature 033 — Log a round"
---

# Tasks: Log a round

**Input**: Design documents from `specs/033-log-a-round/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — Constitution Principle VIII requires tests for every
behaviour change; plan.md declares unit + integration + component layers (E2E
declared N/A). Test tasks are written alongside the code they cover.

**Organization**: Tasks are grouped by user story (US1 → US2 → US3) so each ships
as an independent, testable increment. Authored on `main` (trunk-based).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel (different file, no incomplete dependency).
- **[Story]**: US1 / US2 / US3 for story-phase tasks.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the additive baseline.

- [ ] T001 Confirm the feature is additive — no `drizzle/` migration, no new
  dependency — and that `pnpm typecheck` + `pnpm test` are green on `main` before
  starting (baseline for the gate diff).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared pieces every story needs — the validation schema, the roster
query, and the base i18n keys.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T002 [P] Add `logRoundSchema` + `LogRoundInput` type in
  `lib/validation/round.ts`: `items` array (min 1) of `{ memberId: uuid,
  beerTypeId: uuid }`, with a refinement rejecting duplicate `memberId`s (FR-012).
- [ ] T003 [P] Unit test `tests/unit/round-schema.spec.ts`: accepts a valid
  multi-item round; rejects empty `items`; rejects a duplicate `memberId`; rejects
  a non-uuid `memberId`/`beerTypeId`.
- [ ] T004 [P] Add `listActiveMembersForRound(clubId, selfMemberId)` to
  `lib/db/queries/members.ts`: all active members of the club (logger included)
  selecting `{ id, displayName, avatarKey, avatarUploadAt }` plus an `isSelf`
  flag, ordered self-first then by `displayName`.
- [ ] T005 Add the base `round.*` key set to `messages/cs.json` AND
  `messages/en.json` (identical key trees): `title`, `ctaLink`, `collapse`,
  `defaultBeerHint`, `drinkersHint`, `count` (ICU plural), `submitCta` (ICU plural
  with `{count}`), `toastLogged` (ICU plural), `toastError`. (Partial/skip keys
  come in US3.)

**Checkpoint**: schema + roster query + base copy ready.

---

## Phase 3: User Story 1 - Pour a same-beer round in one tap (Priority: P1) 🎯 MVP

**Goal**: Pick one beer, tap the drinkers (logger pre-selected), confirm once →
one beer on each drinker's own tab; the logger's own needs no review, teammates'
each get a "logged for you" review.

**Independent Test**: Select a beer + yourself + three teammates, confirm; verify
four consumptions on four tabs with correct beer/price, stock −4, no review on
your own, one review per teammate.

### Implementation for User Story 1

- [ ] T006 [US1] Implement `logRoundAction` in
  `app/[locale]/(app)/log/actions.ts` per `contracts/round-action.md`: parse with
  `logRoundSchema`; in ONE transaction get-or-open the club's open `drink_session`
  once (race-safe, as `logBeerAction`); for each item verify active club member
  → else skip `TARGET_NOT_IN_CLUB`, verify beer in-club+not-archived → else skip
  `BEER_NOT_AVAILABLE`, atomic conditional stock decrement → else skip
  `OUT_OF_STOCK`, write `stock_changes` audit row, insert `consumptions`
  (`member_id = item.memberId`, `created_by_user_id = actor`, price snapshot);
  collect `logged`/`skipped`; return `ALL_SKIPPED` when nothing logged; else
  `revalidatePath('/','/log','/tab')` and return `{ logged, skipped, sessionId,
  balanceAfterMinor }` (balance read AFTER commit).
- [ ] T007 [P] [US1] Integration test
  `tests/integration/log-round-action.spec.ts`: N drinkers incl. self → N
  consumptions on N tabs, correct price, stock −N; the logger's own beer leaves
  NO on-behalf review (member==creator) while each teammate's produces exactly
  one; a memberId from another club / inactive → that item reported in `skipped`
  as `TARGET_NOT_IN_CLUB`, the rest logged.
- [ ] T008 [P] [US1] Create `components/picker/member-multi-select.tsx`: an avatar
  toggle grid reusing `MemberAvatar`; each tile a `button` with `aria-pressed`,
  ring+check when selected, accessible name = display name (+ "(ty)" for self);
  props `{ members, selected: Set, onToggle }`.
- [ ] T009 [US1] Evolve `components/home/home-log-for-other.tsx` →
  `components/home/round-logger.tsx`: collapsed affordance (spec-029 inline
  pattern); expanded = default `BeerPickerDropdown` (pre-filled from
  `defaultBeerTypeId`) + `member-multi-select` (self pre-selected) + live
  "🍺 ×N" count + submit `submitCta`; submit builds `items` (round default beer
  for every selected drinker), calls `logRoundAction`; on `ok` → `celebrateBeer()`
  + `toastLogged` + `router.refresh()` + reset selection (stay on home); submit
  disabled at 0 drinkers. (Override is US2.)
- [ ] T010 [US1] Wire `app/[locale]/(app)/page.tsx`: fetch
  `listActiveMembersForRound(ctx.club.id, ctx.member.id)`; render `<RoundLogger
  members=… beers=inStockCatalog defaultBeerTypeId=lastBeer?.id …/>` inside the
  Útrata card where `<HomeLogForOther>` was; remove the old control + its import +
  the now-unused `listOtherActiveMembers` home usage if fully replaced; keep
  "render only when other active members exist".
- [ ] T011 [P] [US1] Component test `tests/component/round-logger.spec.tsx`
  (action mocked with `vi.mock()`): logger tile pre-selected; toggling a teammate
  updates the count + submit label; submit disabled with 0 drinkers; success path
  calls `logRoundAction` with the expected `items`, celebrates, and resets.

**Checkpoint**: Same-beer round works end to end — MVP shippable.

---

## Phase 4: User Story 2 - One person wants something different (Priority: P2)

**Goal**: Override a single drinker's beer within an otherwise same-beer round.

**Independent Test**: Set round beer A, select three, override one to beer B,
confirm → two get A, one gets B, each on their own tab.

**Dependency**: edits `round-logger.tsx` (T009) — sequential after US1.

### Implementation for User Story 2

- [ ] T012 [US2] Add per-person override to
  `components/home/round-logger.tsx`: each selected tile carries a beer chip
  showing its current beer (round default unless overridden); tapping opens a
  `BeerPickerDropdown` scoped to that drinker; store an `overrides: Map<memberId,
  beerTypeId>`; clearing reverts to default; submit builds `items` with
  `overrides[m] ?? defaultBeerTypeId`. (No action change — `logRoundAction`
  already accepts per-item `beerTypeId`.)
- [ ] T013 [US2] Add `overrideHint` + `clearOverride` keys to `messages/cs.json`
  + `messages/en.json` (parity).
- [ ] T014 [P] [US2] Extend `tests/component/round-logger.spec.tsx`: overriding a
  drinker sends that drinker's chosen beer in `items`; clearing reverts them to
  the round default.
- [ ] T015 [P] [US2] Extend `tests/integration/log-round-action.spec.ts`: a
  mixed-beer round logs each drinker's specified beer (two of A, one of B) with
  correct per-beer price + stock decrements.

**Checkpoint**: Mixed-beer round works; US1 still independently functional.

---

## Phase 5: User Story 3 - A beer runs out mid-round (Priority: P3)

**Goal**: Partial success — log every in-stock beer, name the skipped one;
all-out → record nothing and say so.

**Independent Test**: Take one beer to zero, build a round including it, confirm →
in-stock beers logged, skipped drinker/beer named; take all to zero → nothing
logged, "couldn't record the round".

**Dependency**: the per-item skip + `ALL_SKIPPED` already live in `logRoundAction`
(T006); this story surfaces them in the UI + locks them with tests.

### Implementation for User Story 3

- [ ] T016 [US3] Verify/finalize the skip semantics in `logRoundAction`
  (`app/[locale]/(app)/log/actions.ts`): each item independently skippable
  (`OUT_OF_STOCK` / `BEER_NOT_AVAILABLE` / `TARGET_NOT_IN_CLUB`); `skipped[]`
  carries `{ memberId, beerTypeId, reason }`; `logged` empty → `{ ok:false,
  code:'ALL_SKIPPED' }`; only logged items write a `stock_changes` row.
- [ ] T017 [US3] Add `toastLoggedPartial` (names the skipped drinker(s)/beer(s))
  and `toastAllSkipped` keys to `messages/cs.json` + `messages/en.json` (parity).
- [ ] T018 [US3] Handle the partial/all-skipped results in
  `components/home/round-logger.tsx`: `ok` with `skipped` → celebrate +
  `toastLoggedPartial` (resolve skipped memberIds → names) + refresh + reset;
  `ok:false ALL_SKIPPED` → `toastAllSkipped` error, no celebrate, no reset.
- [ ] T019 [P] [US3] Extend `tests/integration/log-round-action.spec.ts`: one
  beer out of stock → the rest log, `skipped` reports it, `ok:true`; ALL beers out
  of stock → `ok:false code 'ALL_SKIPPED'`, zero consumptions + zero stock-audit
  rows written.
- [ ] T020 [P] [US3] Extend `tests/component/round-logger.spec.tsx`: a partial
  result renders the partial toast and resets; an `ALL_SKIPPED` result renders the
  error toast and does NOT reset the selection.

**Checkpoint**: Round is robust to out-of-stock; all three stories independent.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] If `member-multi-select.tsx` / `round-logger.tsx` trip the
  `i18n:check` JSX/arrow false-positive (as `member-picker-dropdown` did), add
  them to the checker's EXCLUDED set in `scripts/i18n-check.ts` with a one-line
  reason; otherwise no-op.
- [ ] T022 Run the full gate suite — `pnpm typecheck`, `pnpm lint`,
  `pnpm test` (unit+integration+component+i18n:check+forms:check), `pnpm build` —
  and fix any failure. (E2E not run — declared N/A in plan.md.)
- [ ] T023 Execute `specs/033-log-a-round/quickstart.md` manual walkthrough on the
  dev server (same-beer round, override, out-of-stock) to confirm the in-place
  refresh + reset behaviour.
- [ ] T024 Remove the dead `home-log-for-other.tsx` (renamed) and any orphan
  imports/exports; flip CLAUDE.md's `033` note from "Currently planning" to "Most
  recently shipped" with the as-built summary.

---

## Dependencies & Execution Order

- **Setup (T001)** → no deps.
- **Foundational (T002–T005)** → blocks ALL stories. T002/T004 are `[P]`
  (different files); T003 depends on T002; T005 independent.
- **US1 (T006–T011)** → after Foundational. T006 (action) and T008
  (member-multi-select) are `[P]` (different files); T009 depends on T008 + the
  schema; T010 depends on T009 + T004; tests T007/T011 `[P]` against their
  targets.
- **US2 (T012–T015)** → after US1 (edits `round-logger.tsx` from T009; relies on
  T006's per-item beer).
- **US3 (T016–T020)** → after US1 (surfaces T006's skip paths). US2 and US3 both
  edit `round-logger.tsx` → sequential with each other, not `[P]`.
- **Polish (T021–T024)** → after the desired stories.

### Within each story

- Tests for the action/component land with the code they cover (not strict
  TDD-first here, but each story closes with its tests green before the next).
- Action before component before page wiring.
- Story complete (gates green) before moving to the next priority.

---

## Parallel Opportunities

- Foundational: T002 ‖ T004 (schema ‖ query); T003 after T002.
- US1: T006 (action) ‖ T008 (picker component); their tests T007 ‖ T011.
- Cross-story: US2 and US3 are NOT parallel with each other (same component file);
  each is internally `[P]` only across its different-file test tasks.

---

## Implementation Strategy

### MVP first (US1 only)

1. T001 → T002–T005 (Foundational) → T006–T011 (US1).
2. **STOP and validate**: same-beer round works (integration + component green;
   manual quickstart steps 1–6).
3. Ship the MVP to `main`.

### Incremental delivery

1. Foundation + US1 → ship (same-beer round).
2. US2 → ship (per-person override).
3. US3 → ship (out-of-stock robustness).
4. Polish (T021–T024) → final gate sweep + quickstart + CLAUDE.md flip.

Each story is its own commit group referencing its task IDs + `US#`.

---

## Notes

- No schema change / migration; the round persists only as `consumptions` rows.
- `[P]` = different file, no incomplete dependency. `round-logger.tsx` is touched
  by T009/T012/T018 → keep those sequential.
- Commit after each task or logical group; reference `T0NN` + `US#`.
- E2E intentionally omitted (plan.md declaration); do not add a Playwright spec.
