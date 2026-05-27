---
description: "Task list — Post-Shipping Polish Round (spec 026)"
---

# Tasks: Post-Shipping Polish Round (A-E)

**Input**: Design documents from `/specs/026-polish-round-a-e/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/beer-tile.md, quickstart.md

**Tests**: REQUIRED — plan.md declares integration (1 spec) + component (1 new + 1 extension) layers per Constitution v1.10.0 Principle VIII. Unit + E2E are explicitly N/A.

**Organization**: Three user stories. MVP = Phase 2 + Phase 3 (US1, BeerTile extraction + wire). US2 (banner avatar) and US3 (intentional-dropdown doc comment) are independent and small.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label on Phase 3+ tasks only
- Paths repo-root-relative

---

## Phase 1: Setup

**Purpose**: None — no schema, no new npm packages, no migrations, no new i18n keys.

(Skipped — proceeds directly to Phase 2.)

---

## Phase 2: Foundational (none required)

This spec has no foundational scaffolding — all three user stories are independent. Proceeds directly to Phase 3.

---

## Phase 3: User Story 1 — Extract BeerTile + standardize the three call-sites (Priority: P1) 🎯 MVP

**Story goal**: A shared `BeerTile` component with `size: 'card' | 'tile'` variants. Three existing call-sites (`/log`, `/log/for`, match-result form) collapse to one primitive.

**Independent test**: Render each surface; confirm tile shape per variant; existing per-surface component tests pass unchanged.

- [X] T001 [US1] Create `components/log/beer-tile.tsx` per `contracts/beer-tile.md`. Props: `{ beer: { id, name, currentStock, unitPriceMinor? }, size: 'card' | 'tile', selected: boolean, onClick, disabled?, currencyCode?, locale?, className? }`. `size='card'` renders h-32 with price line; `size='tile'` renders h-16 name-only. Both share selected/unselected/disabled styling. Client component (`'use client'`) so it can be tapped — but no internal state.
- [X] T002 [US1] Component test `tests/component/beer-tile.spec.tsx` (NEW) covering the 6 test obligations in `contracts/beer-tile.md`: name on both variants, card has price line, tile has no price, selected state, click fires, disabled prevents click. Depends on T001.
- [X] T003 [US1] Refactor `components/log/beer-grid.tsx` — replace the inline `<Card className="h-32 ...">` with `<BeerTile size="card" beer={b} selected={false} onClick={...} disabled={...} currencyCode={...} locale={...} />`. Preserve the existing onClick + disabled-on-out-of-stock + price-formatting logic. Existing `home-one-tap-log` tests (no, that's a different file) — the `/log` page renders this via BeerGrid; no separate test for BeerGrid exists today, so the BeerTile component test + the page rendering covers it.
- [X] T004 [US1] Refactor `components/log/log-on-behalf-form.tsx` beer-section grid — replace the inline `<button className="h-16 ...">` block with `<BeerTile size="tile" beer={b} selected={beerId === b.id} onClick={() => setBeerId(b.id)} disabled={b.currentStock <= 0} />` per beer. The existing `tests/component/log-on-behalf-form.spec.tsx` (spec 024 wiring smoke) MUST pass unchanged — it asserts on button text + click, which BeerTile preserves.
- [X] T005 [US1] Refactor `app/[locale]/(app)/match/[agreementId]/RecordResultForm.tsx` bet-beer picker — replace the inline `<button className="h-16 ...">` block (the per-beer tiles, NOT the Auto tile) with `<BeerTile size="tile" beer={b} selected={betBeerOverrideId === b.id} onClick={() => setBetBeerOverrideId(b.id)} />`. The Auto tile stays inline (per research D3 — it has no beer object). Existing `tests/component/record-result-form.spec.tsx` (spec 025) MUST pass unchanged — it asserts on `getByRole('button', { name: 'Stout' })` + `aria-pressed` which BeerTile preserves.

**Checkpoint US1**: Three surfaces use shared BeerTile; existing component tests pass; grep for inline `h-32` / `h-16` beer-tile classNames in `app/` + `components/log/` + `components/match` returns zero matches beyond the new BeerTile itself and the Auto tile.

---

## Phase 4: User Story 2 — Logger avatar on home on-behalf review banner (Priority: P1)

**Story goal**: The home banner shows the logger's avatar inline before the logger name — matches every other on-behalf surface (spec 023 gap closed).

**Independent test**: Seed an on-behalf consumption; open home as the consumer; banner shows logger's avatar inline.

- [X] T006 [US2] Extend `getOnBehalfReviewForMember` in `lib/db/queries/on-behalf-review.ts` to project `loggerMemberId` + `loggerAvatarKey` + `loggerAvatarUploadAt` on each `OnBehalfReviewRow`. Add a `members` alias join on `userId = consumptions.createdByUserId AND clubId = consumptions.clubId` (same pattern as spec 023 used for the tab on-behalf attribution in `consumption.ts`).
- [X] T007 [US2] Integration test `tests/integration/on-behalf-review-avatar-fields.spec.ts` (NEW). Seed a club + a consumer + a logger (with mixed avatar variants) + an on-behalf consumption. Assert the result row carries `loggerMemberId` + `loggerAvatarKey` + `loggerAvatarUploadAt` matching the seeded logger. Depends on T006.
- [X] T008 [US2] Extend `OnBehalfReviewBannerRow` interface in `components/home/on-behalf-review-banner.tsx` to include the three new fields. Wire `<MemberAvatar size="inline" />` before the logger name in the `<p>` on line 72. Use `avatarUploadUrl(row.loggerMemberId, row.loggerAvatarUploadAt)` for the upload URL. The Beer icon stays for now (it's a beer-type signifier, distinct from the logger-avatar identity signifier).
- [X] T009 [US2] Update `app/[locale]/(app)/page.tsx` (home page) to pass through the new fields from the query result to the banner. If the page maps the query rows into a view shape, extend that mapping.
- [X] T010 [US2] Extend `tests/component/on-behalf-review-banner.spec.tsx` with an assertion: given a row with `loggerAvatarKey` set, the banner renders a `<MemberAvatar>` (assert via the bg-primary/15 wrapper class) before the logger name. Depends on T008.

**Checkpoint US2**: Home banner shows logger avatar; integration test confirms query shape; component test extension passes.

---

## Phase 5: User Story 3 — Intentional dropdown comment on home one-tap log (Priority: P3 verification)

**Story goal**: A clear comment in `home-one-tap-log.tsx` explains why the picker uses a dropdown (not a tile grid) — vertical-space constraint.

**Independent test**: Read the file; confirm the comment is present and clearly explains the choice.

- [X] T011 [US3] Add a comment block in `components/home/home-one-tap-log.tsx` near the DropdownMenu render block explaining: home is a vertical-space-constrained surface; a beer-tile grid would push critical content below the fold on a 360-wide phone; the DropdownMenu items (`<Beer icon> name <price>`) broadly match the BeerTile aesthetic. Comment also notes this is INTENTIONAL so a future audit doesn't re-flag the picker as off-pattern.

**Checkpoint US3**: Comment lands; future audit has a clear rationale.

---

## Phase 6: Polish & Cross-Cutting

- [X] T012 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass.
- [X] T013 Manual walkthrough per `quickstart.md` — confirm US1 + US2 + US3 + the regression checks (Standa-persona fallback, single-beer catalog, /log card visual unchanged).
- [X] T014 Mark `spec.md` status `Shipped (2026-05-27)`.
- [X] T015 Update `CLAUDE.md` SPECKIT marker — move spec 026 from "in flight" to "most recent shipped".
- [ ] T016 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 3 (US1, MVP) — T001 (BeerTile component) → T002 (component test)
                        ↓
                     T003 ‖ T004 ‖ T005 (3-way parallel: each refactors a different file)
   ↓
Phase 4 (US2)      — T006 (query) → T007 (integration test)
                                  ↘
                                    T008 (banner wire, depends on T006) → T010 (component test)
                                    T009 (home page passthrough, depends on T006)
   ↓
Phase 5 (US3)      — T011 (comment, fully independent)
   ↓
Phase 6 (Polish)   — T012 (gates) → T013 (manual) → T014 → T015 → T016
```

## Parallel Execution Examples

**Within Phase 3 (US1)** after T001+T002 land:
```
T003 (beer-grid.tsx)            ┐
T004 (log-on-behalf-form.tsx)    ├─ all 3 land in parallel, different files
T005 (RecordResultForm.tsx)     ┘
```

**Within Phase 4 (US2)** after T006 lands:
```
T007 (integration test)         ┐
T008 (banner wire)               ├─ all 3 land in parallel
T009 (home page passthrough)    ┘
                                  ↓
                                T010 (banner component test, depends on T008)
```

**US3 (T011)** runs in parallel with anything else in any phase — it's a doc comment in a single file with no dependencies.

## Implementation Strategy

**MVP scope = Phase 3 (US1)**. After MVP, the three beer-picker surfaces share one primitive; future tile tweaks land in one file. US2 + US3 are small extensions that close the audit's other findings.

**Smallest demo cut**: T001 + T003 (BeerTile + /log only). Skips tests + the other two surfaces — not shippable but proves the path.

**Constitution alignment**: Integration test for the query shape extension (T007); component tests for the new BeerTile primitive (T002) + extended banner spec (T010). Existing tests for the three refactored consumers (log-on-behalf-form, record-result-form, home-one-tap-log) MUST pass unchanged — the BeerTile preserves the button semantics they depend on.
