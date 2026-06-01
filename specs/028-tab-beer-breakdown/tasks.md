# Tasks: Beer Breakdown on the Tab

**Feature**: 028-tab-beer-breakdown
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contracts**: [contracts/breakdown.md](./contracts/breakdown.md)

Tests REQUIRED (Principle VIII): unit (pure helper) + component (render). No integration (no new query), no E2E.

---

## Phase 1: Setup

No new deps / scaffolding. Skip.

---

## Phase 2: Foundational (blocking prerequisite)

- [X] T001 Create the pure grouping helper `lib/tab/group-beer-breakdown.ts` — `groupTabEntriesByBeer(entries: MemberTabEntry[]): BeerBreakdownGroup[]`. Counted predicate `!voided && kind !== 'transfer_out'`; bucket by `(beerTypeName, dayKey)` where `dayKey = createdAt.toISOString().slice(0,10)`; `count` = bucket size, `subtotalMinor` = Σ entry `unitPriceMinor` (bigint), `representativeDate` = a bucket entry's `createdAt`; sort `dayKey` desc then `subtotalMinor` desc; `[]` when nothing countable. Export the `BeerBreakdownGroup` interface. Import `MemberTabEntry` type from `lib/db/queries/consumption`.

**Checkpoint**: helper compiles + is independently unit-testable; both the component and the page depend on it.

---

## Phase 3: User Story 1 — Beer breakdown before settling (Priority: P1) 🎯 MVP

**Goal**: /tab shows a grouped breakdown ("{beer} ×{count} · {subtotal}") summing to the tab total, with the chronological undoable list still below.

**Independent Test**: A tab with several beers of 2+ types renders one group per (type, day) with name/count/subtotal; breakdown total == tab total; chronological list still present.

### Tests for US1

- [X] T002 [P] [US1] Unit test `tests/unit/group-beer-breakdown.spec.ts` — contract cases 1–9: same-type grouping, distinct types at equal price, voided excluded, transfer_out excluded, transfer_in included, multi-day buckets newest-first, within-day subtotal-desc sort, the Σ-subtotal-equals-counted-predicate-total invariant, empty → [] + single-entry group.
- [X] T003 [P] [US1] Component test `tests/component/tab-beer-breakdown.spec.tsx` — renders a row per group (name/count/subtotal), plural count copy in cs + en, summed displayed subtotals equal the grand total, empty groups render nothing.

### Implementation for US1

- [X] T004 [P] [US1] Create `components/tab/tab-beer-breakdown.tsx` — props `{ groups, currencyCode, locale }`; section heading + one row per group "{beer} ×{count} · {subtotal}" via next-intl plural; per-day sub-heading (locale-formatted `representativeDate`) when groups span >1 dayKey; renders nothing when `groups` empty. Reuse `formatMoney`.
- [X] T005 [P] [US1] Add i18n keys `tab.breakdown.heading` + `tab.breakdown.line` (plural `{count}`) to `messages/en.json` + `messages/cs.json` (Czech plural forms).
- [X] T006 [US1] Wire into `app/[locale]/(app)/tab/page.tsx` — compute `groupTabEntriesByBeer(tab.entries)`; render `<TabBeerBreakdown>` above the chronological `<TabEntryRow>` list only when the group array is non-empty. Leave the total card + list + undo unchanged.

**Checkpoint**: US1 demoable end-to-end; US2 (empty) + US3 (bet-adjusted) fall out of the helper's predicate, verified by the unit tests.

---

## Phase 4: User Story 2 — Empty / single-beer tab (Priority: P2)

**Goal**: no breakdown on an empty tab; a one-beer tab shows a single group.

- [X] T007 [US2] Verify empty + single-entry behaviour: covered by T002 (empty → [], single → one group) + T006's non-empty guard (no breakdown rendered when []). Confirmation task — no new production code.

---

## Phase 5: User Story 3 — Bet-adjusted correctness (Priority: P2)

**Goal**: won-away beers excluded, picked-up beers included, breakdown total == tab total under bets.

- [X] T008 [US3] Verify bet-adjustment: covered by T002 cases (transfer_out excluded, transfer_in included, invariant). Confirmation task — the predicate is identical to the tab-total predicate, so parity holds by construction. No new production code.

---

## Phase 6: Polish & Cross-Cutting

- [X] T009 Full gate: `pnpm test` + `pnpm build`. All green.
- [X] T010 Add BACKLOG follow-ups: beer breakdown on /settle (full outstanding balance, may span sessions) + on /history/[sessionId].
- [X] T011 Update CLAUDE.md SPECKIT block: mark 028 shipped.

---

## Dependencies & Execution Order

- **T001** blocks all — helper is the data source for the component, the page, and the tests.
- **US1 (T002–T006)** is the MVP. T002/T003/T004/T005 are `[P]` (distinct files). T006 (page wiring) depends on T001 + T004.
- **US2 (T007)** + **US3 (T008)** are confirmation tasks over T002's cases — no new code.
- **Polish (T009–T011)** last.

## Parallel Execution Examples

- After T001: T002 + T003 + T004 + T005 all in parallel (helper test, component test, component, i18n — four distinct files).

## Implementation Strategy

MVP = US1 (T001–T006). US2 + US3 are correctness properties already proven by the helper's unit cases — the bet-adjustment and empty handling are intrinsic to the counted predicate, not separate code paths. Ship together.
