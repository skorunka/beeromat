# Tasks: Recreate Last Match

**Feature**: 027-recreate-last-match
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contracts**: [contracts/recreate-action.md](./contracts/recreate-action.md)

Tests are REQUIRED (Constitution Principle VIII). Layers: integration (query + action) + component (button). No unit, no E2E (see plan.md test-layer declaration).

---

## Phase 1: Setup

No new dependencies, no scaffolding. The feature slots into existing modules. Skip.

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T001 Add `lastAgreementForMember(clubId, memberId): Promise<OpenAgreementSummary | null>` to `lib/db/queries/match-agreements.ts` — most-recent-by-`createdAt` agreement (any state) the member participates in, assembled into the existing `OpenAgreementSummary` shape, club-scoped, `null` when none. Reuse the row-grouping pattern from `listOpenAgreements`/`getAgreement`.

**Checkpoint**: The query helper exists and compiles; both user stories depend on it.

---

## Phase 3: User Story 1 — One-tap recreate of the last matchup (Priority: P1) 🎯 MVP

**Goal**: A member who has played a match sees a labelled Recreate control on `/match`; tapping it clones the lineup into a new OPEN agreement and navigates to it.

**Independent Test**: With a prior agreement the member is in, `/match` renders "Recreate: {sideA} vs {sideB}"; activating it creates a matching OPEN agreement and lands on its detail page.

### Tests for US1

- [X] T002 [P] [US1] Integration test `tests/integration/last-agreement-for-member.spec.ts` — covers: most-recent ordering, RECORDED source returned, CANCELLED source returned (Q4), excludes non-participant agreements, per-club scoping, null when none (contract cases 1–6).
- [X] T003 [P] [US1] Integration test `tests/integration/recreate-last-match-action.spec.ts` — covers: happy clone singles, happy clone doubles (seats + pairing + forBeer), cancelled-source clone, `NO_LAST_MATCH`, per-club scoping. (STALE_PARTICIPANT lives in US3.)
- [X] T004 [P] [US1] Component test `tests/component/recreate-last-match-button.spec.tsx` — renders the matchup label from props; tap dispatches the action and navigates on success; generic failure → error toast.

### Implementation for US1

- [X] T005 [US1] Add `recreateLastMatchAction(): Promise<RecreateLastMatchResult>` to `app/[locale]/(app)/match/actions.ts` — `requireUnlocked()`, re-resolve `lastAgreementForMember`, map to `CreateAgreementInput`, delegate to `createAgreementTx`, `revalidatePath('/match')`, return `{ ok, agreementId }` / `NO_LAST_MATCH` / inherited create errors. (The active-participant guard is added in US3 — T010.)
- [X] T006 [P] [US1] Create `components/match/recreate-last-match-button.tsx` — props `{ sideA, sideB }`; renders "Recreate: {sideA} vs {sideB}"; on tap calls the action, toast + `router.push('/match/{agreementId}')` on success, generic error toast otherwise; disabled/pending while in flight.
- [X] T007 [P] [US1] Add i18n keys to `messages/en.json` + `messages/cs.json`: `match.recreate.cta`, `match.recreate.created`, `match.recreate.failed` (staleParticipant added in US3).
- [X] T008 [US1] Wire into `app/[locale]/(app)/match/page.tsx` — server-resolve `lastAgreementForMember`; when non-null, render `RecreateLastMatchButton` with `joinSideNames`-built side labels at the top of the hub (above Upcoming). When null, render nothing.

**Checkpoint**: US1 is independently demoable — recreate works end-to-end for valid lineups; US2 (empty) falls out of T008's null branch.

---

## Phase 4: User Story 2 — No prior match to recreate (Priority: P2)

**Goal**: A member who has never played sees no recreate control.

**Independent Test**: With no participated agreements, `/match` renders no recreate control.

- [X] T009 [US2] Verify the empty-state path: confirm T001's query returns `null` for a non-participant member and T008's wiring renders nothing. Add the null-return assertion to `tests/integration/last-agreement-for-member.spec.ts` if not already covered by T002 (it is — contract case 6 + the non-participant case). No new production code; this is a confirmation task that the empty path is covered.

**Checkpoint**: Empty-state correctness verified by the query's null case + the page's conditional render.

---

## Phase 5: User Story 3 — Stale lineup guard (Priority: P2)

**Goal**: Recreating a match with a since-removed participant blocks cleanly with a clear error.

**Independent Test**: When a source participant is inactive, activating recreate creates no agreement and surfaces a member-facing error.

### Tests for US3

- [X] T010 [P] [US3] Extend `tests/integration/recreate-last-match-action.spec.ts` with the `STALE_PARTICIPANT` case — a source participant deactivated (`is_active = false`); action returns `{ ok: false, code: 'STALE_PARTICIPANT', memberName }` and creates no agreement.
- [X] T011 [P] [US3] Extend `tests/component/recreate-last-match-button.spec.tsx` — `STALE_PARTICIPANT` result surfaces an error toast and does NOT navigate.

### Implementation for US3

- [X] T012 [US3] Add the active-participant guard to `recreateLastMatchAction` (T005) — after resolving the source, check every participant's `is_active`; if any inactive, return `{ ok: false, code: 'STALE_PARTICIPANT', memberName }` before delegating to `createAgreementTx`. Resolve the offending display name when available.
- [X] T013 [US3] Add the `match.recreate.staleParticipant` i18n key to `messages/en.json` + `messages/cs.json`; wire the `STALE_PARTICIPANT` branch in `recreate-last-match-button.tsx` to show it.

**Checkpoint**: A roster change can never 500 or produce a broken agreement.

---

## Phase 6: Polish & Cross-Cutting

- [X] T014 Run the full gate: `pnpm test` (unit + integration + component + i18n:check + forms:check) and `pnpm build`. All green.
- [X] T015 Add the deferred follow-up to `BACKLOG.md`: per-row "repeat this match" on history/agreement rows (out of scope for 027).
- [X] T016 Update the CLAUDE.md SPECKIT block: mark 027 shipped (move from "in flight" to "most recent shipped specs").

---

## Dependencies & Execution Order

- **T001 (Foundational)** blocks everything — the query is the data source for both the hub render and the action.
- **US1 (T002–T008)** is the MVP. Tests T002–T004 are `[P]` (distinct files). T005 (action) precedes T008 (page wiring uses it); T006/T007 are `[P]` with T005.
- **US2 (T009)** depends only on T001 + T008 — no new code, a coverage confirmation.
- **US3 (T010–T013)** depends on US1 (extends the action + the button + their tests). T010/T011 `[P]`; T012 then T013.
- **Polish (T014–T016)** last.

## Parallel Execution Examples

- US1 test trio in parallel: T002, T003, T004 (three separate new files).
- After T005 lands: T006 + T007 in parallel (component file + i18n files).
- US3: T010 + T011 in parallel (integration extension + component extension).

## Implementation Strategy

MVP = US1 (T001–T008): recreate works for valid lineups, and the empty state (US2) falls out for free from T008's null branch. US3 hardens against roster churn. Ship US1+US2+US3 together — US3 is small and the guard matters for real clubs.
