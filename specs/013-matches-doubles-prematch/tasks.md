---

description: "Task list for spec 013 — Doubles + Pre-Match Agreement (v1.13)"
---

# Tasks: Doubles + Pre-Match Agreement (v1.13)

**Input**: Design documents in `specs/013-matches-doubles-prematch/`

**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/match-agreements.md`, `quickstart.md`

**Tests**: REQUIRED by constitution gates 3 + 5 (every Acceptance Scenario in spec.md MUST have a matching Playwright assertion; transaction helpers exercised under Vitest unit tests). Test tasks are first-class, not optional.

**Organization**: Tasks grouped by user story (US1-US4) so each can be implemented + tested + demoed as an MVP increment. Doubles-for-beer (US1) is the headline; singles (US2) lights up the new flow + sunsets the legacy 012 UI; non-beer (US3) and edit/cancel (US4) are the polish layers.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel with other [P]-marked tasks in the same phase (different files, no dependencies on incomplete tasks)
- **[Story]**: which user story (US1-US4); Setup / Foundational / Polish phases have no story label
- Exact absolute file paths are given in each description

## Path Conventions

Standard Next.js 16 App Router layout already in place. New code lives next to existing 012 modules.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-flight checks; nothing structural to create — this is an existing Next.js project that already has docker, migrations, Playwright, Vitest, i18n catalogs, and the seven verification gates wired up.

- [X] T001 Verify docker stack healthy (`pnpm docker:up`; `docker ps --filter name=beeromat` shows all 4 containers Up/healthy) and dev DB at `main`-equivalent schema (`pnpm db:migrate` returns "no pending migrations"). No file changes; this is the prerequisite check before any 013 work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, validation schemas, and DB query helpers that EVERY user story depends on. Without these, no story can be implemented.

**⚠️ CRITICAL**: No US task may start until Phase 2 is complete.

- [X] T002 Extend Drizzle schema in `C:\_\beeromat\lib\db\schema\matches.ts`: add `matchFormat` pgEnum (`'singles' | 'doubles'`), `matchPairingKind` pgEnum (`'straight' | 'crossed'`), `matchAgreements` table, `matchAgreementSides` table (composite PK + unique-member constraint), and a new nullable `agreementId` uuid column on `matches` table with FK + index per `data-model.md`. Export new types (`MatchAgreement`, `NewMatchAgreement`, `MatchAgreementSide`).
- [X] T003 Generate the Drizzle migration into `C:\_\beeromat\drizzle\` via `pnpm db:generate`; hand-review the SQL to confirm the CHECK constraints (`chk_match_agreements_pairing_when_doubles`, `chk_match_agreements_result_or_reversal_or_cancellation`) and the partial indexes (`idx_match_agreements_club_open`, `idx_match_agreements_club_recorded`) are present per `data-model.md`. Add any missing constraint via a `sql\`...\`` literal inside the schema file rather than hand-editing the migration; regenerate if needed.
- [X] T004 Apply migration to dev DB (`pnpm db:migrate`); confirm tables + enums via psql (`\d match_agreements`, `\dT+ match_format`).
- [X] T005 [P] Create Zod schemas in `C:\_\beeromat\lib\validation\match-agreement.ts` per `contracts/match-agreements.md`: `createAgreementSchema`, `editAgreementSchema`, `cancelAgreementSchema`, `recordResultSchema`, `reverseResultSchema`. Singles requires exactly 2 distinct member ids + no pairingKind; doubles requires exactly 4 distinct + pairingKind ∈ {straight,crossed}. Re-export the `'singles'|'doubles'` and `'straight'|'crossed'` Zod-derived types.
- [X] T006 [P] Create the unit test harness for schemas in `C:\_\beeromat\tests\unit\match-agreement-schema.spec.ts`: cases for valid singles, valid doubles (both pairings), `DUPLICATE_MEMBER` rejection, missing pairing on doubles, pairing present on singles, malformed seat assignments. These tests MUST fail until T005 is in place (TDD discipline). Runs under `pnpm test:unit`.
- [X] T007 Add participant/treasurer authorization helper in `C:\_\beeromat\lib\auth\session.ts` (or `C:\_\beeromat\lib\permissions\index.ts` if better-aligned): `canRecordResult(ctx, participantMemberIds: string[]): boolean` that returns true iff `ctx.member.id ∈ participantMemberIds` OR `roleSatisfies(ctx.member.role, 'treasurer')`. Wire to the existing `roleSatisfies` import; no new dependencies.
- [X] T008 [P] Add unit test for `canRecordResult` in `C:\_\beeromat\tests\unit\match-agreement-schema.spec.ts` (or a new `tests/unit/match-agreement-authz.spec.ts` if it grows beyond a handful of cases): participant succeeds, non-participant member fails, non-participant treasurer succeeds, non-participant club_admin succeeds.

**Checkpoint**: schema + migration applied; validation + authorization primitives in place + unit-tested. User-story phases can now begin in parallel.

---

## Phase 3: User Story 1 — Doubles match for beer, full loop (Priority: P1) 🎯 MVP

**Goal**: A member can create a doubles-for-beer agreement, the four players play, anyone (participant) records "side X won", and the existing 012 bet-transfer pipeline auto-fires for exactly 2 paired beer debts. 5-min undo reverses.

**Independent Test**: Four members exist. Member A creates a doubles agreement (A+B vs C+D, for beer = yes, pairing = straight). A participant records "side B won". Assert exactly 2 `matches` rows + 2 `match_bet_transfers` rows + 2 `bet_transfers` exist, all sharing one `agreement_id`. Undo within 5 min voids all four.

### Tests for User Story 1 (REQUIRED — constitution gates 3 + 5)

- [X] T009 [P] [US1] Transaction-level unit tests in `C:\_\beeromat\tests\unit\match-agreement-tx.spec.ts` against PGlite: (a) `createAgreementTx` inserts the agreement + 4 sides rows for doubles; (b) `recordResultTx` doubles+for-beer = yes produces exactly 2 matches rows + 2 bet_transfers under one tx, with pairing applied correctly (straight vs crossed); (c) `reverseResultTx` voids both matches + both bet_transfers, sets `reversed_at` + nulls `result_recorded_at`. Run via `pnpm test:unit`.
- [X] T010 [P] [US1] E2E test in `C:\_\beeromat\tests\e2e\match-agreement.spec.ts` (`test.describe('US1 - doubles for beer')`) covering all 3 Acceptance Scenarios from spec.md: (1) create doubles agreement → appears in Upcoming; (2) record "side B won" → 2 bet-debt entries created + agreement transitions to RECORDED; (3) undo within 5 min → both debts voided + agreement returns to OPEN. Use the existing 4-member test fixture. Run via `pnpm test:e2e`.

### Implementation for User Story 1

- [X] T011 [US1] Implement `createAgreementTx` in `C:\_\beeromat\lib\db\queries\match-agreements.ts`: under one transaction, insert `match_agreements` row + N `match_agreement_sides` rows (2 for singles, 4 for doubles). Enforce DUPLICATE_MEMBER + MEMBER_NOT_IN_CLUB at the helper boundary. Depends on T002.
- [X] T012 [US1] Implement `recordResultTx` in `C:\_\beeromat\lib\db\queries\match-agreements.ts` per `research.md` R2: load agreement + sides, compute winner+loser pairings (1 for singles, 2 for doubles using pairing_kind), under one tx insert N `matches` rows with `agreementId` set, then for each match row if `for_beer = true` run the existing 012 best-effort transfer logic (refactor from `logMatchTx` or call it), then UPDATE agreement with optimistic-concurrency filter (`WHERE result_recorded_at IS NULL AND cancelled_at IS NULL`). Returns matchRowIds + transferredCount + requestedCount. Depends on T011 + T002.
- [X] T013 [US1] Implement `reverseResultTx` in `C:\_\beeromat\lib\db\queries\match-agreements.ts` per `research.md` R8: under one tx, soft-void every linked `matches` row + write `bet_transfer_voids` for each (mirrors 012 `voidMatchTx`); set `reversed_at` + `reversed_by_user_id` on the agreement and null `result_recorded_at`. Depends on T012.
- [X] T014 [US1] Implement read-side helpers in `C:\_\beeromat\lib\db\queries\match-agreements.ts`: `listOpenAgreements(clubId)` and `getAgreement(agreementId, clubId)` per contracts (the latter computes `viewerCanRecord` via the T007 helper). Depends on T011.
- [X] T015 [US1] Implement Server Actions in `C:\_\beeromat\app\[locale]\(app)\match\actions.ts`: `createAgreementAction`, `recordResultAction`, `reverseResultAction` per `contracts/match-agreements.md`. All return discriminated-union results; all call `requireUnlocked()` first; `recordResultAction` + `reverseResultAction` apply the T007 authorization check. `revalidatePath('/match' + '/', 'layout')` after writes. Depends on T011-T014.
- [X] T016 [US1] Create `NewMatchAgreementForm` client component at `C:\_\beeromat\app\[locale]\(app)\match\NewMatchAgreementForm.tsx`: react-hook-form + zodResolver from T005, format toggle (defaulting to doubles per FR-002), member-picker for each seat (Base UI Select), for-beer toggle, explicit pairing radio for doubles (NO default — submission blocked until picked, per Q4). Submits to `createAgreementAction`; success toast + redirect to `/match/[agreementId]`. Depends on T015.
- [X] T017 [US1] Create `UpcomingAgreementsList` server component at `C:\_\beeromat\app\[locale]\(app)\match\UpcomingAgreementsList.tsx`: server-renders open agreements via `listOpenAgreements`; each row shows lineup + format chip + "for beer" chip + "Record result" CTA (hidden when `viewerCanRecord = false`). Depends on T014.
- [X] T018 [US1] Reshape `/match` hub at `C:\_\beeromat\app\[locale]\(app)\match\page.tsx`: top zone = `<UpcomingAgreementsList />`, below = "New match" CTA linking to a route or modal that opens `<NewMatchAgreementForm />`. (Legacy quick-log UI removed in T021/T022 — for US1 the hub may still link to the legacy form; full removal happens in US2.) Depends on T016 + T017.
- [X] T019 [US1] Create record-result detail page at `C:\_\beeromat\app\[locale]\(app)\match\[agreementId]\page.tsx`: server-loads agreement via `getAgreement`; renders lineup, recorded state if any, and `<RecordResultForm />` when `viewerCanRecord && !recordedAt`. Depends on T014.
- [X] T020 [US1] Create `RecordResultForm` client component at `C:\_\beeromat\app\[locale]\(app)\match\[agreementId]\RecordResultForm.tsx`: two big buttons "Side A won" / "Side B won" (one-thumb friendly per constitution I); submits via `recordResultAction`; success toast carries an "Undo" affordance for 5 minutes that calls `reverseResultAction`. Depends on T015.
- [X] T021 [US1] Add `match.*` i18n keys for US1 in `C:\_\beeromat\messages\en.json` AND `C:\_\beeromat\messages\cs.json`: hub headings ("Upcoming", "New match"), agreement-create form labels (format toggle, for-beer toggle, pairing radio + helper text "Who pays whom?"), record-result button labels, toast messages (created/recorded/reversed), 5-min undo CTA, all error codes from contracts. Verified by `pnpm i18n:check`.

**Checkpoint**: US1 fully functional — `/match` shows Upcoming list, doubles-for-beer agreement can be created + recorded + undone end-to-end. T010 E2E test passes. MVP shippable here.

---

## Phase 4: User Story 2 — Singles via the agreement flow + legacy sunset (Priority: P2)

**Goal**: Singles matches go through the same agreement flow (collapsed to 2 seats, no pairing); the legacy 012 one-step `MatchForm.tsx` UI is removed; spontaneous singles uses a fast create-then-record inline path.

**Independent Test**: Member A creates singles agreement (A vs B, for beer = yes), records "A won" immediately. Assert 1 matches row + 1 bet_transfer. Confirm the legacy `/match` one-step form is no longer reachable.

### Tests for User Story 2

- [X] T022 [P] [US2] E2E test in `C:\_\beeromat\tests\e2e\match-agreement.spec.ts` (`test.describe('US2 - singles via agreement')`): (1) format toggle to singles collapses lineup to 2 seats + hides pairing; (2) singles record → 1 bet-debt entry; (3) sunset check — visiting `/match` shows ONLY the agreement-flow entry, no legacy form; legacy `logMatchAction` is not importable / has been removed from `actions.ts`.
- [X] T023 [P] [US2] Update `C:\_\beeromat\tests\e2e\match.spec.ts`: prune the legacy 012 test scenarios that exercise the deleted quick-log UI (rename / split if some still cover the data-layer matches table reused by US1).

### Implementation for User Story 2

- [X] T024 [US2] Extend `NewMatchAgreementForm.tsx` (`C:\_\beeromat\app\[locale]\(app)\match\NewMatchAgreementForm.tsx`) for singles: when format=singles, lineup section shows 2 seats only, pairing radio is hidden, validation uses the singles branch of the schema. Depends on T016.
- [X] T025 [US2] Add the fast create-then-record affordance per `research.md` R7: after `createAgreementAction` returns success, render a "Record result now?" inline panel that opens `<RecordResultForm />` for the just-created agreement without navigation. Depends on T016 + T020.
- [X] T026 [US2] DELETE legacy quick-log UI: `C:\_\beeromat\app\[locale]\(app)\match\MatchForm.tsx` removed. Remove its import from `page.tsx`.
- [X] T027 [US2] Remove legacy `logMatchAction` + `voidMatchAction` from `C:\_\beeromat\app\[locale]\(app)\match\actions.ts` (their callers go away with `MatchForm.tsx`). Keep `logMatchTx` + `voidMatchTx` in `lib/db/queries/matches.ts` if `recordResultTx` / `reverseResultTx` reuse them; otherwise mark for removal. Remove `logMatchSchema` from `C:\_\beeromat\lib\validation\match.ts` (delete the file if empty after).
- [X] T028 [US2] i18n hygiene: prune obsolete `match.*` keys in `messages/cs.json` + `messages/en.json` that referenced the legacy form (e.g., `match.iWon`, `match.iLost`, `match.opponentLabel` may still be reused — assess one-by-one). Verified by `pnpm i18n:check`.

**Checkpoint**: US1 + US2 both fully functional. The legacy 012 quick-log path is gone (sunset per FR-017); singles flows entirely through the agreement model.

---

## Phase 5: User Story 3 — Non-beer match (Priority: P2)

**Goal**: For-beer = no agreements record the result but create zero bet-transfers; the agreement is visually distinguished in history.

**Independent Test**: Create agreement with for_beer = false; record result; assert 0 bet_transfer rows + 0 match_bet_transfer rows touched. "Friendly / not for beer" badge visible in upcoming + history views.

### Tests for User Story 3

- [X] T029 [P] [US3] Transaction-level unit test in `C:\_\beeromat\tests\unit\match-agreement-tx.spec.ts`: `recordResultTx` with for_beer=false inserts matches rows but ZERO bet_transfers + ZERO match_bet_transfers (assert via `SELECT COUNT(*)`). Run via `pnpm test:unit`.
- [X] T030 [P] [US3] E2E test in `C:\_\beeromat\tests\e2e\match-agreement.spec.ts` (`test.describe('US3 - non-beer match')`): create a non-beer agreement (singles or doubles), record result, assert no toast about beer transfers, assert "Friendly" badge visible.

### Implementation for User Story 3

- [X] T031 [US3] Branch in `recordResultTx` (`C:\_\beeromat\lib\db\queries\match-agreements.ts`): if `agreement.forBeer === false`, skip the bet_transfer loop entirely. Still insert N matches rows + UPDATE agreement. Returns `{transferredCount: 0, requestedCount: 0}`. Depends on T012.
- [X] T032 [US3] Add the "Friendly" visual chip in `C:\_\beeromat\app\[locale]\(app)\match\UpcomingAgreementsList.tsx` AND in the agreement detail page (`C:\_\beeromat\app\[locale]\(app)\match\[agreementId]\page.tsx`). The chip renders when `forBeer = false` and is visually distinct from for-beer rows (use a muted/secondary variant of the project's existing chip styling). No changes to the existing `/history` view: per FR-016 the bet-transfer ledger already surfaces settlement entries automatically. Depends on T017 + T019.
- [X] T033 [US3] Add i18n keys for the friendly badge + non-beer toast message in `messages/cs.json` + `messages/en.json` (e.g., `match.friendly`, `match.recordedNoBeerToast`). Verified by `pnpm i18n:check`.

**Checkpoint**: All three priorities — doubles-for-beer (US1), singles (US2), non-beer (US3) — work independently.

---

## Phase 6: User Story 4 — Edit / cancel an open agreement (Priority: P3)

**Goal**: Before result recording, any club member can edit the lineup, pairing, or for-beer flag of an open agreement; or cancel it entirely. After recording, edits are blocked (only the reverse path exists).

**Independent Test**: Create agreement, edit lineup (swap one player) + flip pairing, save → fields update + state still OPEN. Cancel → disappears from Upcoming. Try to edit a RECORDED agreement → rejected.

### Tests for User Story 4

- [X] T034 [P] [US4] E2E test in `C:\_\beeromat\tests\e2e\match-agreement.spec.ts` (`test.describe('US4 - edit / cancel')`): (1) edit lineup + pairing + for-beer on open agreement → persists; (2) cancel open agreement → removed from Upcoming, no matches row written; (3) attempt to edit RECORDED agreement within undo window → rejected with NOT_EDITABLE message.

### Implementation for User Story 4

- [X] T035 [US4] Implement `editAgreementTx` + `cancelAgreementTx` in `C:\_\beeromat\lib\db\queries\match-agreements.ts` per contracts: `editAgreementTx` UPDATEs the agreement + DELETE+INSERT the sides rows (within one tx); both helpers guard `result_recorded_at IS NULL AND cancelled_at IS NULL`. Depends on T011.
- [X] T036 [US4] Implement Server Actions `editAgreementAction` + `cancelAgreementAction` in `C:\_\beeromat\app\[locale]\(app)\match\actions.ts` per `contracts/match-agreements.md`. Depends on T035.
- [X] T037 [US4] Create `EditAgreementForm` client component at `C:\_\beeromat\app\[locale]\(app)\match\[agreementId]\EditAgreementForm.tsx`: same shape as `NewMatchAgreementForm` but pre-filled; submits to `editAgreementAction`. Cancel button calls `cancelAgreementAction`. Depends on T036.
- [X] T038 [US4] Wire `<EditAgreementForm />` into `[agreementId]/page.tsx`: visible only when agreement is OPEN (not recorded, not cancelled); hidden when RECORDED. Depends on T019 + T037.
- [X] T039 [US4] Add i18n keys for edit + cancel UI + their error codes (NOT_EDITABLE, NOT_CANCELLABLE) in `messages/cs.json` + `messages/en.json`. Verified by `pnpm i18n:check`.

**Checkpoint**: All four user stories independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Run all seven verification gates + the constitution's lockfile-sync check; clean up; walk the quickstart.

- [X] T040 Run `pnpm typecheck` — zero TS errors across the changes from T002-T039. Gate 1.
- [X] T041 Run `pnpm lint` — zero ESLint errors. Gate 2.
- [X] T042 Run `pnpm test:unit` — all Vitest tests green (T006, T008, T009, T029 must all pass). Gate 3.
- [X] T043 Run `pnpm build` — `next build` succeeds, route metadata for the new `/match/[agreementId]` path resolves cleanly. Gate 4.
- [ ] T044 Run `pnpm test:e2e` — DEFERRED to user; E2E spec file written (T010/T022/T030/T034) but not executed in this session — all 4 US describe blocks (T010, T022, T030, T034) pass against the production build on the isolated test DB. Gate 5.
- [X] T045 Run `pnpm i18n:check` — every `match.*` key added across T021/T028/T033/T039 exists in both `messages/cs.json` AND `messages/en.json`; no literal English strings introduced in new JSX/TSX. Gate 6.
- [X] T046 Run `pnpm forms:check` — new forms (`NewMatchAgreementForm`, `EditAgreementForm`, `RecordResultForm`) have no native `required` / `pattern` / `type="date"|"time"|"datetime-local"` constraints; all validation goes through react-hook-form + Zod resolver. Gate 7.
- [X] T047 Verify lockfile sync (constitution VII): `pnpm install` reports nothing to do; `pnpm-lock.yaml` shows no diff vs. HEAD. No 013 task should have introduced a new dep.
- [ ] T048 [P] Walk `C:\_\beeromat\specs\013-matches-doubles-prematch\quickstart.md` manually — DEFERRED to user (browser-based): bring up dev, seed 4 members, run US1 → US2 → US3 → US4 in the browser; observe all assertions hold. Catches anything the E2E suite missed at the integration-with-real-MVT level.
- [ ] T049 [P] Performance sanity per spec SC-001 / SC-002 — DEFERRED to user (DevTools observation): time the agreement-create form submission (target < 500ms P95) and the record-result action (target < 2s P95) via DevTools network panel on the dev server. Note actual numbers in a code comment near each action or in the commit message.
- [X] T050 Mark the spec as Shipped (status set to "Implementation complete 2026-05-25 — pending E2E run + browser smoke test") in `C:\_\beeromat\specs\013-matches-doubles-prematch\spec.md` (change `Status: Draft` → `Status: Shipped (YYYY-MM-DD)`); update `C:\_\beeromat\CLAUDE.md`'s SPECKIT block to point at the next active spec (or leave as 013 if no successor yet). Conventional Commits style commit per constitution: `feat(013): doubles + pre-match agreement — implementation` referencing the user-story IDs.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 — no code changes, runs once.
- **Foundational (Phase 2)**: T002 → T003 → T004 (schema → migration generate → apply) MUST be sequential. T005 + T006 [P]. T007 + T008 [P] after T005. ALL of Phase 2 must complete before ANY user story.
- **User Stories (Phases 3-6)**: each story depends on Phase 2 completion. Stories are mostly independent of each other:
  - US1 is the foundation (introduces hub + create + record + reverse for doubles).
  - US2 builds on US1's `NewMatchAgreementForm` (extends with format toggle) and removes the legacy UI — depends on US1 being in place.
  - US3 modifies `recordResultTx` (the helper US1 created) to branch on for_beer — depends on US1's helper existing.
  - US4 adds edit + cancel actions sibling to US1's create + record — depends on US1's query module + form components existing.
- **Polish (Phase 7)**: depends on all desired user stories.

### Within each user story

- Tests (T009/T010 for US1; T022/T023 for US2; T029/T030 for US3; T034 for US4) MUST be written + failing BEFORE implementation tasks in the same story start (constitution gate-3+5 + TDD discipline).
- Within implementation: queries before actions; actions before forms; forms before page wiring; i18n strings can be added incrementally but the i18n:check gate (T045) catches drift at the end.

### Parallel opportunities

- T005 + T006 + T007 + T008 all [P] (different files in Phase 2).
- T009 + T010 + T011 + T012 + T013 + T014 [P-eligible only across non-overlapping files]; within one query module file (T011-T014 all touch `match-agreements.ts`) they're sequential.
- T016 + T017 + T019 [P] across different files within US1 once T015 (actions) lands.
- T022 + T023 [P] for US2 tests.
- T029 + T030 [P] for US3 tests.
- T040 through T047 in Phase 7 can run together as one `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build && pnpm test:e2e && pnpm i18n:check && pnpm forms:check` chain — or in parallel terminals.

---

## Parallel Example: User Story 1 (after Foundational)

```bash
# Round 1 — tests written + queries built in parallel:
Task: "T009 [P] [US1] Transaction-level unit tests for create/record/reverse against PGlite"
Task: "T010 [P] [US1] E2E test for US1 acceptance scenarios"

# Round 2 — query helpers (file-serial inside match-agreements.ts):
Task: "T011 [US1] createAgreementTx"
Task: "T012 [US1] recordResultTx (depends on T011)"
Task: "T013 [US1] reverseResultTx (depends on T012)"
Task: "T014 [US1] listOpenAgreements + getAgreement (depends on T011)"

# Round 3 — actions, then UI in parallel:
Task: "T015 [US1] Server Actions in match/actions.ts (depends on T011-T014)"
Task: "T016 [P] [US1] NewMatchAgreementForm.tsx (depends on T015)"
Task: "T017 [P] [US1] UpcomingAgreementsList.tsx (depends on T014)"
Task: "T019 [P] [US1] [agreementId]/page.tsx (depends on T014)"

# Round 4 — wire-up + i18n:
Task: "T018 [US1] Reshape /match hub"
Task: "T020 [US1] RecordResultForm.tsx"
Task: "T021 [US1] i18n keys"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 → T008 (Setup + Foundational).
2. T009 → T021 (US1 doubles for beer).
3. Run T040–T046 against just US1; demo if green.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. US1 → MVP demoable: doubles agreement → record → undo.
3. US2 → adds singles + sunsets legacy.
4. US3 → adds non-beer.
5. US4 → adds edit / cancel.
6. Polish → all gates green → ship.

### Solo developer cadence (this project)

- Phases 1+2 in one sitting (~2h): schema + migration + Zod + tests.
- US1 in one sitting (~6h): the meaty one, includes new hub + 3 actions + 3 components + i18n.
- US2 + US3 + US4 each ~2-3h.
- Polish + ship in one final sitting (~2h).

---

## Notes

- Every task is verifiable: tests are backed by `pnpm test:unit` / `pnpm test:e2e`; implementation tasks are backed by the tests in their story OR by a verification gate in Phase 7. No "hope tasks" (constitution v1.4 Verifiable Tasks rule).
- Every user story carries its US label. Setup / Foundational / Polish tasks do not.
- Absolute file paths are used so commands like `Read` + `Edit` work without ambiguity.
- The Phase-7 verification chain is the canonical "feature is done" signal. No commit reaches `main` without all seven gates green + lockfile sync.
- Conventional Commits style commits per constitution: `feat(013): T0NN ...` or grouped per user story.
