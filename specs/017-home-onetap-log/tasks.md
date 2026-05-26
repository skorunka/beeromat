---
description: "Task list for spec 017 — Home redesign + one-tap log-a-beer"
---

# Tasks: Home redesign + one-tap log-a-beer

**Input**: Design documents from `/specs/017-home-onetap-log/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/home-page.md`, `quickstart.md` — all complete.

**Tests**: Integration + Component tests are REQUIRED per the plan's
Test Layer Declaration (Constitution v1.10.0 Principle VIII). Unit
+ E2E layers are not used by this spec (justified in plan.md).

**Organization**: Tasks grouped by user story per Constitution
Spec/Task Discipline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies).
- **[Story]**: User story label (US1 / US2 / US3 / US4).
- Exact file paths included.

## Path Conventions

Next.js App Router monorepo. Paths from repo root.

---

## Phase 1: Setup

**Purpose**: Trivial scaffolding only — most "setup" was done by
the existing app.

- [X] T001 Ensure `components/home/` directory exists at repo root (created on first Write call in T007).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The new query helper that ALL four user stories depend on.

**⚠️ CRITICAL**: No US-phase task can land before Phase 2 is green.

- [X] T002 [P] Integration test: `lastBeerForMember(memberId, clubId)` covers (a) returns null when no consumption exists, (b) returns the most recent non-voided consumption's beer joined with `currentStock`/`isArchived`/`unitPriceMinor`, (c) ignores voided consumptions, (d) scopes correctly by club — write at `tests/integration/last-beer-for-member.spec.ts`. 7 cases green.
- [X] T003 Implement `lastBeerForMember(memberId, clubId)` in `lib/db/queries/consumption.ts` per the SQL shape in `specs/017-home-onetap-log/data-model.md`. Single round-trip, joins `consumptions` → `beer_types`, LEFT JOIN `consumption_voids` to filter voided, ORDER BY `created_at DESC` LIMIT 1.

**Checkpoint**: T002 + T003 both green → user-story phases unblocked.

---

## Phase 3: User Story 1 — One-tap log a beer (Priority: P1) 🎯 MVP

**Goal**: A returning member with a predictable last-beer can log
that beer in one tap from the home screen, with visible
confirmation (toast + balance update), no navigation.

**Independent Test**: Open `/` as a member whose last beer is
Pilsner (in stock, not archived). The primary CTA reads "Zapiš
Pilsner". Tap once → toast "Zapsáno · útrata X Kč" + balance
sentence updates on the same page. New `consumptions` row exists
in the DB.

### Catalog strings (US1)

- [X] T004 [P] [US1] Added `home.oneTapLog`, `home.oneTapLogGeneric`, `home.pickAnother`, `home.toastLogged`, `home.toastError` to `messages/en.json`.
- [X] T005 [P] [US1] Added same keys to `messages/cs.json`. Nag-tone-clean (verified by T012).

### Component test for US1 (REQUIRED — write before T007)

- [X] T006 [US1] Component test variants V1 + V6 + V3 + V4 + V5 in `tests/component/home-one-tap-log.spec.tsx` (9 cases — folded T014's V3/V4/V5 in since they share one file). Mocks `logBeerAction`, `next/navigation`, `@/lib/i18n/navigation`.

### Implementation (US1)

- [X] T007 [US1] Created `components/home/home-one-tap-log.tsx` covering all five variants (V3/V4/V5 land here too since variant choice is a pure function of `beer` — US3 logic ships with US1).
- [X] T008 [US1] Rewrote `app/[locale]/(app)/page.tsx` to load `lastBeerForMember()` in parallel with `memberBalance()`. Page rewrite collapsed US1 + US2 + US4 page changes since they all touch the same file.

**Checkpoint US1**: Tapping the home button logs a beer end-to-end.
Component test green. Integration test green. Manual quickstart
section 1 ("Returning-member happy path") passes.

---

## Phase 4: User Story 2 — Balance as a friendly sentence (Priority: P1)

**Goal**: Replace the big-numeric balance card with a one-line
Czech/English sentence ("Tvoje útrata: 380 Kč" / "Vyrovnáno"). No
nag tone.

**Independent Test**: Render `/` for an owing member in cs locale
→ "Tvoje útrata: 380 Kč" appears as a sentence, no "Outstanding
balance" label, no big numeric card. Render for a square member →
"Vyrovnáno" alone, no settle CTA.

### Catalog strings (US2)

- [X] T009 [P] [US2] Added `home.balanceOwed`, `home.balanceSquare` to `messages/en.json`.
- [X] T010 [P] [US2] Added same keys to `messages/cs.json`. Nag-tone-clean.

### Implementation (US2)

- [X] T011 [US2] Removed the Card-with-large-numeric-balance block from `app/[locale]/(app)/page.tsx`; replaced with a single `<p>` rendering `home.balanceOwed` or `home.balanceSquare`. Done as part of T008's page rewrite.
- [X] T012 [P] [US2] Nag-tone audit: `grep -rE "dluž" messages/ app/[locale]/(app)/` → empty (exit 1 = no matches). Gate clean.

**Checkpoint US2**: Home renders the sentence in both locales for
owing + square states. Stale `home.outstandingBalance` /
`home.settleUp` / `home.allSquare` catalog keys may be removed in
Polish phase.

---

## Phase 5: User Story 3 — Predictive default falls back gracefully (Priority: P2)

**Goal**: When the predictive last-beer is archived, out of stock,
or first-time (no prior beer), the UI surfaces the right fallback
state (not a button that doesn't work).

**Independent Test**: Render `/` for three test members: A with a
healthy last-beer, B with an archived last-beer, C with an
in-stock-zero last-beer. A → button "Zapiš Pilsner" enabled.
B → "Zapiš pivo" linking to `/log`. C → button "Pilsner —
nedostupné" disabled + "Vyber jiné pivo →" link visible.

### Catalog strings (US3)

- [X] T013 [P] [US3] Added `home.oneTapLogUnavailable` to `messages/{cs,en}.json` (alongside T004/T005 catalog batch).

### Component tests for US3

- [X] T014 [US3] V3 + V4 + V5 covered in `tests/component/home-one-tap-log.spec.tsx` (folded into T006's spec file).

### Implementation (US3)

- [X] T015 [US3] Variant resolution lives in `components/home/home-one-tap-log.tsx` as pure prop-driven branching: `null` → V3, `isArchived` → V4, `currentStock <= 0` → V5, else V1. Shipped with T007.

**Checkpoint US3**: All five non-pending render variants pass
their component tests. No `lastBeerForMember` change required —
the query already returns the data needed to make the choice in
the component.

---

## Phase 6: User Story 4 — Settle CTA stays reachable but secondary (Priority: P2)

**Goal**: Owing members see "Vyrovnat útratu" below the log
button, visibly less prominent. Square members see no settle CTA.

**Independent Test**: Render `/` as owing member → DOM order is
balance sentence → primary log button → secondary settle link.
Render as square member → no settle CTA in the DOM.

### Catalog strings (US4)

- [X] T016 [P] [US4] Added `home.settleCta` to `messages/{cs,en}.json`. Legacy `home.settleUp` left in place until T018 polish.

### Implementation (US4)

- [X] T017 [US4] Secondary settle CTA rendered as `<Link>` with `buttonVariants({ variant: 'outline' })` below `<HomeOneTapLog />` when `balanceMinor > 0n`. No CTA when square. Shipped with T008's page rewrite.

**Checkpoint US4**: All four user stories ship green together.
The home screen now satisfies the panel's recommendations.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Cleanup + verification across all stories.

- [X] T018 [P] Dropped `home.settleUp` and `home.allSquare` orphans from both catalogs. Kept `home.outstandingBalance` — it's still used by the treasurer admin balance page, not actually orphan.
- [X] T019 [P] BACKLOG.md updated: one-tap-log item struck through with the spec 017 reference.
- [X] T020 All 8 always-on gates green: typecheck ✓ lint ✓ test:unit ✓ test:integration ✓ test:component ✓ build (20.2s) ✓ i18n:check ✓ forms:check ✓.
- [ ] T021 Manual quickstart paths 1–5 — to run from the dev server after commit.
- [ ] T022 Mark spec status Shipped (2026-05-26) and push commits to main.

---

## Dependencies & Execution Order

### Phase order

1. **Phase 1 (Setup)** — T001. Trivial.
2. **Phase 2 (Foundational)** — T002 + T003. Must complete before any US task.
3. **Phase 3 (US1)** — depends on Phase 2. The MVP. Stops here if you want to ship incrementally.
4. **Phase 4 (US2)** — depends on Phase 2 + Phase 3 (the page.tsx file is shared).
5. **Phase 5 (US3)** — depends on Phase 3 (extends `HomeOneTapLog`).
6. **Phase 6 (US4)** — depends on Phase 3 + 4 (the page layout is shared).
7. **Phase 7 (Polish)** — depends on all above.

### Within a single developer

Recommended linear order: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → ship US1 → T009 → T010 → T011 → T012 → ship US2 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022.

### Parallel opportunities

If running multi-headed:

- T004 ‖ T005 (different catalog files).
- T009 ‖ T010 (different catalog files).
- T002 may run before T003 lands (test-first).
- T006 may run before T007 (test-first).
- T014 may run before T015 (test-first).
- T012 (grep audit) ‖ T011 (implementation) — they share no files.
- T018 ‖ T019 (different files).

---

## Implementation Strategy

### MVP scope = US1 only

Phase 1 → 2 → 3 = a working home with one-tap log on top of today's
balance card. Shippable on its own; the redesign continues with US2.

### Incremental delivery

- MVP (US1) → branch state A: home has one-tap log button; balance card unchanged.
- Add US2 → state B: home replaces balance card with sentence.
- Add US3 → state C: edge cases (archived/out-of-stock/first-time) render correctly.
- Add US4 → state D: settle becomes secondary visual.
- Polish → state E: orphan strings removed, BACKLOG marked.

Each state is a valid commit landing on `main`.

### Constitution v1.10.0 Test Layer Declaration (recap)

Tests in this spec live in:

- `tests/integration/last-beer-for-member.spec.ts` (T002).
- `tests/component/home-one-tap-log.spec.tsx` (T006 + T014).

No `tests/unit/*` additions (no pure-function logic worth
isolating). No `tests/e2e/*` additions (no new server action, no
multi-system seam — the existing `logBeer` action is reused
verbatim).

---

## Notes

- [P] tasks = different files, no dependencies.
- Each task names the exact file it touches.
- Tests written BEFORE implementation in this list — verify they
  fail before writing the implementation task that makes them pass.
- Commit after each task or logical group; constitution says
  trunk-based direct-to-main, so each commit is a release.
- The catalog strings tasks (T004/T005, T009/T010, T013) MUST land
  in pairs (cs + en together) so `pnpm i18n:check` stays green
  between commits.
