---
description: "Task list — Bet-Beer Tile Picker (spec 025)"
---

# Tasks: Bet-Beer Tile Picker

**Input**: Design documents from `/specs/025-bet-beer-tile-picker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bet-beer-tile-grid.md, quickstart.md

**Tests**: REQUIRED — plan.md declares component layer per Constitution v1.10.0 Principle VIII. Unit + integration + E2E are explicitly N/A (no new pure functions, no schema change, no crucial-journey introduction).

**Organization**: Tasks grouped by user story. MVP = Phase 2 + Phase 3 (US1, tap-to-pick + Auto preselect). US2 (default flow) is covered by US1's submit-without-override test. US3 (out-of-stock hidden) is verification only.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US3) on Phase 3+ tasks only
- Paths repo-root-relative

---

## Phase 1: Setup

**Purpose**: None — no schema, no new npm packages, no migrations. Spec reuses existing query + tile patterns.

(Skipped — proceeds directly to Phase 2.)

---

## Phase 2: Foundational (i18n keys + page query extension)

**Purpose**: New copy keys + the recorder's last-beer query result that the Auto tile label needs. Foundational because every user story depends on both.

- [X] T001 [P] Add `match.betPicker.autoLabel` ("Auto · {beer}") + `match.betPicker.autoFallback` ("Auto · Pivo") to `messages/cs.json`. Remove the now-obsolete keys: `match.betPicker.label`, `match.betPicker.defaultHint`, `match.betPicker.override`, `match.betPicker.submitHint`.
- [X] T002 [P] Add the same two keys to `messages/en.json` ("Auto · {beer}" + "Auto · Beer"). Remove the same four obsolete keys.
- [X] T003 [P] Extend the `Promise.all` in `app/[locale]/(app)/match/[agreementId]/page.tsx` to include `lastBeerForMember(ctx.member.id, ctx.club.id)` ONLY when `isOpen && agreement.forBeer && viewerCanRecord`; otherwise pass `null`. Destructure as `recorderLastBeer`; pass `loserLastBeerName={recorderLastBeer?.name ?? null}` to `<RecordResultForm />`.

**Checkpoint**: Catalogs parity green (`pnpm i18n:check`); page passes the new prop down even though the form doesn't consume it yet.

---

## Phase 3: User Story 1 — Tap-to-pick bet beer on match settle (Priority: P1) 🎯 MVP

**Story goal**: Replace the `<details>` + native `<select>` with an always-visible tile grid. Auto tile pre-selected with the recorder's last-beer label; tapping any other tile sends the override on submit.

**Independent test**: Seed an open for-beer agreement where the recorder has last-beer "Pilsner" and the catalog has another in-stock beer "Stout". Open the page → confirm tile grid renders with "Auto · Pilsner" + "Stout"; tap "Stout"; tap "Side A won"; confirm the bet transfer carries Stout.

- [X] T004 [US1] Modify `app/[locale]/(app)/match/[agreementId]/RecordResultForm.tsx`. Add `loserLastBeerName?: string | null` to `RecordResultFormProps`. Change `betBeerOverrideId` state type to `string | null` (was `string`). Remove the entire `<details>` block (lines 121-145 in the current file) — the `<summary>`, the `<label>`, the native `<select>`, all of it.
- [X] T005 [US1] In the same file, render an always-visible tile grid above the "who won" buttons when `betBeerOptions && betBeerOptions.length > 0`. Tiles: first the "Auto · …" tile (label uses `t('match.betPicker.autoLabel', { beer: loserLastBeerName })` if `loserLastBeerName` is non-null, else `t('match.betPicker.autoFallback')`); then one tile per `betBeerOptions` entry. Selected style mirrors `/log`'s beer-tile (`bg-primary text-primary-foreground border-primary`). Each tile is `<button type="button" h-16 px-3 ...>`. Selection logic per `contracts/bet-beer-tile-grid.md`.
- [X] T006 [US1] In the same file, update the submit translation: change the existing spread `...(betBeerOverrideId ? { betBeerOverrideId } : {})` so it still spreads only when `betBeerOverrideId` is truthy (non-null). State change from `string` to `string | null` means the empty-string `''` initial value is now `null` — verify the spread still works (yes, `''` and `null` are both falsy, so the spread already filters them).
- [X] T007 [US1] Component test `tests/component/record-result-form.spec.tsx` (NEW) covering the 9 test obligations from `contracts/bet-beer-tile-grid.md`: tile grid renders, Auto pre-selected, Auto label populated vs fallback, tap-non-Auto flips selection, tap-Auto reselects Auto, submit with Auto omits override, submit with beer sends override, picker hidden when betBeerOptions undefined, picker hidden when betBeerOptions empty. Mock `recordResultAction`. Depends on T004+T005+T006.

**Checkpoint US1**: Picker renders, tile selection works, override flows through submit correctly, contract obligations covered by tests.

---

## Phase 4: User Story 2 — Default works for the average match (Priority: P2)

**Story goal**: Submitting without touching the picker uses the server-side auto-default.

**Independent test**: Open a fresh agreement, don't touch the picker, tap "Side A won", confirm action payload omits `betBeerOverrideId`.

- [X] T008 [US2] Verification only — covered by T007 test case "submit with Auto selected omits betBeerOverrideId". No additional code or test needed. If T007 passes, US2 passes.

---

## Phase 5: User Story 3 — Out-of-stock + archived beers stay hidden (Priority: P3)

**Story goal**: No archived / zero-stock beer renders as a tile.

**Independent test**: Seed the catalog with one in-stock, one out-of-stock, one archived. Confirm only the in-stock renders.

- [X] T009 [US3] Verification only — the existing `betBeerOptions` query in `page.tsx:54-67` already filters by `eq(beerTypes.isArchived, false)` + `gt(beerTypes.currentStock, 0)`. Spot-check: read the current page.tsx, confirm the filter is unchanged after T003's edit. No code change unless the audit surfaces a regression.

---

## Phase 6: Polish & Cross-Cutting

- [X] T010 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass. `i18n:check` is the canary — if the four removed keys are still referenced anywhere or the two new keys mismatch, this surfaces immediately.
- [X] T011 Manual walkthrough per `quickstart.md` — confirm US1 + US2 + US3 + the edge cases (no-last-beer fallback, not-for-beer hides picker, reverse window still works).
- [X] T012 Mark `spec.md` status `Shipped (2026-05-27)`.
- [X] T013 Update `CLAUDE.md` SPECKIT marker — move spec 025 from "in flight" to "most recent shipped".
- [ ] T014 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 2 — T001 [P] ‖ T002 [P] ‖ T003 [P]   (3-way parallel)
   ↓
Phase 3 (US1, MVP) — T004 → T005 → T006 → T007 (sequential — same file)
   ↓
Phase 4 (US2)      — T008 (verification only, covered by T007)
   ↓
Phase 5 (US3)      — T009 (verification only)
   ↓
Phase 6 (Polish)   — T010 (gates) → T011 (manual) → T012 → T013 → T014
```

## Parallel Execution Examples

**Within Phase 2** (foundational scaffolding):
```
T001 (cs.json keys)        ┐
T002 (en.json keys)         ├─ all 3 land in parallel, different files
T003 (page.tsx query add)  ┘
```

**Within Phase 3 (US1)**: tasks T004→T005→T006→T007 are all serial because they touch the same component file in sequence.

## Implementation Strategy

**MVP scope = Phase 2 + Phase 3 (US1).** After MVP, the bet-beer picker is the always-visible tile grid; US2 (default flow) is covered for free; US3 (filter regression check) is a 30-second audit.

**Smallest demo cut**: T003 + T004 + T005 (skip i18n cleanup + tests for raw demo; not shippable but proves the path).

**Constitution alignment**: No new unit/integration/E2E needed (per plan.md test layer declaration). Component test guards the wire-state translation (`betBeerOverrideId` null vs string) that's the most regressable surface.
