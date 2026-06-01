# Tasks: Inline "Log for Someone Else" on Home

**Feature**: 029-inline-log-for-other
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contracts**: [contracts/inline-log.md](./contracts/inline-log.md)

Tests REQUIRED (Principle VIII): component only (the new dropdown + the inline control). No unit (no new pure logic), no integration (action + query already covered, spec 019/024), no E2E.

---

## Phase 1: Setup

No new deps. Skip.

---

## Phase 2: Foundational (blocking prerequisite)

- [X] T001 Create `components/picker/beer-picker-dropdown.tsx` — common beer dropdown mirroring `MemberPickerDropdown`: props `{ beers, value, onChange, currencyCode, locale, placeholder, ariaLabel, className? }`; base-ui DropdownMenu; trigger = Beer icon + selected name (or placeholder) + chevron (h-12); radio group with `min-h-12 py-3 text-base` items, each "{name}" + right-aligned `formatMoney(unitPriceMinor)`; out-of-stock (`currentStock <= 0`) options disabled; `onChange` + close on select.

**Checkpoint**: the beer dropdown compiles + is usable; the inline control depends on it.

---

## Phase 3: User Story 1 — Inline on-behalf log from home, no reload (Priority: P1) 🎯 MVP

**Goal**: home's "log for someone else" expands inline to member + beer dropdowns + Log; logging stays on home (no reload), refreshes the breakdown, keeps selections.

**Independent Test**: collapsed affordance expands; choosing member + beer enables Log; Log dispatches the on-behalf action, toasts, refreshes in place, keeps selections.

### Tests for US1

- [X] T002 [P] [US1] Component test `tests/component/beer-picker-dropdown.spec.tsx` — placeholder when null, option per beer with price, out-of-stock disabled, onChange fires with id, trigger reflects selection (contract cases 1–5).
- [X] T003 [P] [US1] Component test `tests/component/home-log-for-other.spec.tsx` — collapsed→expand; Log disabled until both picked; tap Log dispatches `logBeerOnBehalfAction({ beerTypeId, targetMemberId })`; success → toast + selections preserved (still expanded); typed failure → error toast + nothing logged + selections preserved; collapse toggle (contract cases 1–6).

### Implementation for US1

- [X] T004 [US1] Create `components/home/home-log-for-other.tsx` — client component, props `{ members, beers, currencyCode, locale }`; `expanded`/`memberId`/`beerId` state + `useTransition`. Collapsed: a "log for someone else" affordance (reuse `log.onBehalf.ctaLink`). Expanded: `MemberPickerDropdown` + `BeerPickerDropdown` + Log button (disabled until both + while pending) + collapse toggle. Log → `logBeerOnBehalfAction`; on ok `celebrateBeer()` + `toast.success(t('toastLogged', {beer, member}))` + `router.refresh()`, keep expanded + selections; on `TARGET_IS_SELF`/`TARGET_NOT_IN_CLUB`/else → matching error toast, change nothing.
- [X] T005 [P] [US1] i18n: reuse `log.onBehalf.*`; add any missing keys to `messages/en.json` + `messages/cs.json` — `beerHint` (beer placeholder), `logCta` (short Log label), `collapse` (collapse aria-label) — cs + en.
- [X] T006 [US1] Wire into `app/[locale]/(app)/page.tsx` — add `listOtherActiveMembers(ctx.club.id, ctx.member.id)` to the page load; replace `<LogForOtherLink hasOtherMembers={...} />` with `{otherMembers.length > 0 ? <HomeLogForOther members={otherMembers} beers={inStockCatalog} currencyCode={...} locale={...} /> : null}`; remove the `LogForOtherLink` import.
- [X] T007 [US1] Remove the now-unused `components/log/log-for-other-link.tsx` (only home used it; /log/for does not render it) and confirm no remaining references.

**Checkpoint**: US1 demoable — inline on-behalf logging works on home with no reload; US2 (no-others) + US3 (errors) fall out of T006's guard + T004's error handling.

---

## Phase 4: User Story 2 — Nothing to do gracefully (Priority: P2)

- [X] T008 [US2] Verify the no-other-members path: T006's `otherMembers.length > 0` guard hides the control; covered by the home render condition (no new code). Confirmation task.

---

## Phase 5: User Story 3 — Errors surface inline (Priority: P2)

- [X] T009 [US3] Verify error handling: covered by T003's typed-failure case (error toast, nothing logged, selections preserved). Confirmation task — no new code beyond T004's error branch.

---

## Phase 6: Polish & Cross-Cutting

- [X] T010 Full gate: `pnpm test` + `pnpm build`. All green. Confirm `/log/for` + its tests still pass (no regression).
- [X] T011 Add BACKLOG follow-up: adopt the shared `BeerPickerDropdown` in the home one-tap chevron + the match bet-beer picker (dedupe).
- [X] T012 Update CLAUDE.md SPECKIT block: mark 029 shipped.

---

## Dependencies & Execution Order

- **T001** (BeerPickerDropdown) blocks T003/T004 (they use it).
- **US1 (T002–T007)**: T002 + T005 are `[P]`; T003 depends on T001+T004 conceptually but is a separate file so can be written in parallel then run after; T004 depends on T001; T006 depends on T004; T007 after T006.
- **US2 (T008)** + **US3 (T009)** are confirmation tasks over T003/T006.
- **Polish (T010–T012)** last.

## Parallel Execution Examples

- After T001: write T002 (beer dropdown test) + T004 (control) + T005 (i18n) in parallel (distinct files).

## Implementation Strategy

MVP = US1 (T001–T007): the inline control fully replaces the navigation link. US2 + US3 are properties of the same code (the render guard + the error branch), confirmed by tests, not separate work. Ship together.
