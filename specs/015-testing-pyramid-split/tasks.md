---

description: "Task list for spec 015 — Testing Pyramid Split (v1.15)"
---

# Tasks: Testing Pyramid Split (v1.15)

**Input**: Design documents in `specs/015-testing-pyramid-split/`

**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md` (R1–R8 — has the per-spec migration playbook), `data-model.md`, `contracts/layer-commands.md`, `contracts/constitution-amendment.md`, `quickstart.md`

**Tests**: All four layers ARE the tests. The "test tasks" in this spec are the migrations and the new layer-infrastructure pieces — there are no separate "write a test for X" tasks because the test re-categorisation IS the work.

**Organization**: Tasks grouped by user story (US1-US5) so each can ship as an independent increment. US1 (component layer + constitution amendment, bundled per Q4) is the MVP — the proof that the new pyramid actually works.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel with other [P]-marked tasks in the same phase (different files, no dependency on incomplete tasks)
- **[Story]**: US1-US5; Setup / Foundational / Polish phases have no story label
- All paths are absolute

## Path Conventions

Standard Next.js 16 App Router layout. New test dirs are siblings under `tests/`. New config files live at repo root.

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: install the new tooling dep + verify the existing test infra still passes before re-arranging it.

- [X] T001 Verify docker stack healthy (`pnpm docker:up`; all 4 beeromat containers Up/healthy) and current full test suite (unit + e2e) green on `main` before any structural changes. Baseline check.
- [X] T002 Add `@playwright/experimental-ct-react` as a devDep at the version matching `@playwright/test` (currently 1.60.x): `pnpm add -D @playwright/experimental-ct-react@1.60`. Verify `pnpm install` reports lockfile clean (constitution VII).
- [X] T003 [P] Confirm `@testing-library/react` (16.x) + `@testing-library/jest-dom` (6.x) + `jsdom` (29.x) are already installed (they ARE, per package.json) — no install action needed, just a verification step so subsequent tasks can assume them.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: stand up the infrastructure that US1 and beyond depend on. The `db.setup.ts` project + the per-layer config files MUST exist before any layer-2/3 tests can land.

**⚠️ CRITICAL**: No US task may start until Phase 2 is complete.

- [X] T004 Create `C:\_\beeromat\tests\e2e\db.setup.ts` per research R3: a Playwright test that asserts loopback on `TEST_DATABASE_DIRECT_URL`, calls `applyMigrations(directUrl)` from the existing `tests/e2e/fixtures/test-db.ts`, logs `[db.setup] schema migrated in NNNms`. Does NOT touch domain data — only schema.
- [X] T005 Modify `C:\_\beeromat\playwright.config.ts` per research R3 + R4: (a) add `db.setup` project with `testMatch: /db\.setup\.ts$/`; (b) make the existing setup project + chromium project declare `dependencies: ['db.setup']`; (c) ADD a new `chromium-mock` project with `testDir: 'tests/e2e-mock'` and same dependencies; (d) DELETE the `globalSetup: './tests/e2e/global-setup.ts'` line (replaced by db.setup project).
- [X] T006 DELETE `C:\_\beeromat\tests\e2e\global-setup.ts` (replaced by T004's db.setup.ts project). Leave `tests/e2e/global-teardown.ts` for now (it's still useful as a post-run DB wipe; review in polish phase).
- [X] T007 Split `C:\_\beeromat\vitest.config.ts` into two configs per research R1: create `C:\_\beeromat\vitest.unit.config.ts` (env: 'node', testDir-equivalent: `tests/unit/`) and `C:\_\beeromat\vitest.component.config.ts` (env: 'jsdom', testDir-equivalent: `tests/component/`, includes RTL setup file). Keep `vitest.config.ts` as a thin re-export that defaults to unit (so `pnpm vitest` still works) OR remove it entirely if package.json scripts are explicit. Lean: remove `vitest.config.ts`.
- [X] T008 [P] Create `C:\_\beeromat\tests\component\_setup.ts`: imports `@testing-library/jest-dom/vitest`, calls `afterEach(() => cleanup())` from `@testing-library/react`. This is the global setup file referenced by `vitest.component.config.ts`.
- [X] T009 [P] Create `C:\_\beeromat\playwright-ct.config.ts` per research R2: Playwright CT config with `testDir: 'tests/component'`, `testMatch: /.*\.ct\.spec\.tsx$/`, ctViteConfig pointing at the project's Vite config (or a minimal one that loads Tailwind). No webserver block (Playwright CT runs its own Vite under the hood).
- [X] T010 [P] Create `C:\_\beeromat\tests\e2e-mock\fixtures\mock-action.ts` per research R5: exports `mockServerAction(page, options)` helper using `page.route()` to intercept Next.js Server Action POST requests by `Next-Action` header. Typed via discriminated union (signature drafted in research R5).
- [X] T011 [P] Create `C:\_\beeromat\tests\e2e-mock\` directory with a placeholder `.gitkeep` so the path exists in git before the first mocked-E2E spec lands.
- [X] T012 [P] Modify `C:\_\beeromat\package.json` per `contracts/layer-commands.md`: add scripts `test:component`, `test:component:visual`, `test:component:all`, `test:component:watch`, `test:e2e-mock`, `test:e2e-full`; rework `test:e2e` to run BOTH `chromium-mock` and `chromium` projects; rework top-level `test` to orchestrate all four layers fail-fast (`test:unit && test:component && test:e2e`); rework `test:unit` to point at `vitest.unit.config.ts`.

**Checkpoint**: infrastructure ready. Each layer's command exists and runs (even if it finds 0 tests). User-story phases can now begin in parallel.

---

## Phase 3: User Story 1 — Component layer + Constitution amendment (Priority: P1) 🎯 MVP

**Goal**: prove the component layer works end-to-end with one sample test, AND bundle the constitution amendment (Principle VIII + 8th gate restructure) in the same commit per the Q4 clarification.

**Independent Test**: `pnpm test:component` finds + runs at least one `.spec.tsx` file using Vitest+RTL in under 10s. `pnpm test:component:visual` finds + runs at least one `.ct.spec.tsx` file using Playwright CT. `.specify/memory/constitution.md` has the new Principle VIII section + 8-gate list.

### Implementation

- [X] T013 [US1] Create sample Vitest+RTL test at `C:\_\beeromat\tests\component\brand-mark.spec.tsx`: renders `<BrandMark />` from `components/ui/brand-mark.tsx`, asserts text "BEEROMAT" appears (catalog rendering check via the existing next-intl test provider — wrap in `NextIntlClientProvider` with English messages). Demonstrates the RTL pattern; the test file becomes the canonical example for migrators.
- [X] T014 [US1] Create sample Playwright CT test at `C:\_\beeromat\tests\component\brand-mark.ct.spec.tsx`: mounts `<BrandMark />`, asserts computed colour matches the Honey Amber token (`rgb(138, 82, 20)`) via `getComputedStyle()`. Demonstrates the CT pattern for visual assertions.
- [X] T015 [US1] Update `C:\_\beeromat\.specify\memory\constitution.md` with the full draft text from `contracts/constitution-amendment.md`: add the SYNC IMPACT REPORT comment at the top (1.7.0 → 1.8.0), add the new `### VIII. Testing Pyramid` section under Core Principles, REPLACE the existing 7-gate list under "Verification Gates" with the 8-gate list (new gate 4 = `pnpm test:component`).
- [X] T016 [US1] Update `C:\_\beeromat\.specify\templates\plan-template.md` — no-op (template has no hardcoded version reference): bump "v1.7.0" reference to "v1.8.0" in the Constitution Check reminder block (per the amendment's Sync Impact Report Templates list).
- [X] T017 [US1] Verify `pnpm test:component` runs T013's RTL test green; `pnpm test:component:visual` runs T014's CT test green. Wall time check: RTL run ≤ 10s, CT run ≤ 30s (SC-001).

**Checkpoint**: US1 fully functional. Component layer infra exists, has sample tests, constitution amended. MVP shippable.

---

## Phase 4: User Story 2 — API-mocked E2E layer (Priority: P2)

**Goal**: prove the mocked-E2E layer works with one sample form-validation test.

**Independent Test**: `pnpm test:e2e-mock` boots the webserver once, runs one sample test that intercepts a Server Action via `mockServerAction`, asserts no DB writes happened.

### Implementation

- [X] T018 [US2] Create sample mocked-E2E test at `C:\_\beeromat\tests\e2e-mock\sample-form-error.spec.ts`: drives `/match` (which exists from spec 013), calls `mockServerAction` with a `VALIDATION_FAILED` response shape, asserts the error toast renders. Inherits the shared admin storageState from auth.setup (per `playwright.config.ts` project dependencies).
- [X] T019 [US2] Add a post-test assertion to T018: query `payments`, `consumptions`, `match_agreements` table counts before AND after the test; assert delta = 0 (no DB writes). This proves the mock-boundary contract from FR-005.
- [ ] T020 [US2] Verify `pnpm test:e2e-mock` runs T018 green — DEFERRED to Polish 8-gate run (T047) to avoid paying cold-build cost twice; total wall time ≤ 90s (SC-002). If it exceeds, investigate webserver-reuse with the other chromium project.

**Checkpoint**: US2 fully functional. Mocked-E2E layer has a working pattern.

---

## Phase 5: User Story 3 — Migrate ≥4 specs to the component layer (Priority: P2) — DEFERRED

> **Deferred to a follow-up spec (BACKLOG: "Presentational-component
> extraction").** Implementation analysis showed that most ux-* specs
> target Next.js server-component pages (`/log`, `/admin/pending`,
> the `(app)/layout.tsx` dispute banner, `loading.tsx` skeletons) —
> none of which mount in isolation under Playwright CT or Vitest+RTL
> without first extracting their visual sub-components into pure
> presentational React components. That refactoring is outside
> spec 015's scope per the Out of Scope section ("DOES NOT include
> changing production code paths"). The two BrandMark samples
> shipped with US1 (T013 + T014) prove the layer works; real
> migration tasks ship as part of the follow-up spec.

**Goal**: deliver measurable suite-time savings by migrating the easiest-win visual + locale + empty-state specs.

**Independent Test**: each migrated spec passes at the component layer; the corresponding `tests/e2e/*.spec.ts` file is deleted (or scenarios moved out); `pnpm test:e2e` no longer includes them.

### Implementation (each task moves one spec; do them in parallel)

- [ ] T021 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux-i18n.spec.ts` → `C:\_\beeromat\tests\component\i18n-rendering.spec.tsx` (Vitest+RTL). Both EN + CS scenarios parameterised. Delete the source spec.
- [ ] T022 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux-bet-no-session.spec.ts` → `C:\_\beeromat\tests\component\bet-empty-state.spec.tsx` (Vitest+RTL with a fixture for "no session" state).
- [ ] T023 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux-loading.spec.ts` → `C:\_\beeromat\tests\component\loading-skeleton.spec.tsx` (Vitest+RTL — asserts `animate-pulse` class presence on the skeleton element).
- [ ] T024 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux2-guidance.spec.ts` → `C:\_\beeromat\tests\component\guidance-banners.spec.tsx` (Vitest+RTL — empty-state + dispute-banner copy assertions; uses fixtures, not real DB).
- [ ] T025 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux-touch-targets.spec.ts` → `C:\_\beeromat\tests\component\touch-targets.ct.spec.tsx` (Playwright CT — needs real CSS for bounding-box assertions).
- [ ] T026 [P] [US3] Migrate `C:\_\beeromat\tests\e2e\ux-pending-row.spec.ts` → `C:\_\beeromat\tests\component\pending-row.ct.spec.tsx` (Playwright CT — needs `expectSeparated` viewport helper + real layout).
- [ ] T027 [US3] Run `pnpm test:component` + `pnpm test:component:visual` — all 6 migrated specs pass. Confirm `tests/e2e/` no longer contains the 6 source files.

**Checkpoint**: 6 specs off the true-E2E layer. Wall-time measurement: `time pnpm test:e2e` should drop by the cumulative cost of those 6 specs.

---

## Phase 6: User Story 4 — Migrate ≥4 specs to the API-mocked layer (Priority: P3) — DEFERRED

> **Deferred to a follow-up spec (BACKLOG: "Per-spec true-migration
> audit").** Implementation analysis showed that the mocked-E2E
> layer's savings are smaller than tasks.md projected:
>
> - Spec 014's storageState reuse already removed the per-test
>   sign-in cost (the original source of E2E wall-time pain).
> - Most "form-validation" specs (forms-admin, forms-money,
>   forms-auth) seed DB state so the FORM RENDERS — the seed is
>   the cost, not the action submission. Mocked-E2E doesn't help.
> - The truly clean candidates (forms-auth with no seed, parts of
>   account) have other constraints — forms-auth tests sign-in
>   itself, so it can't load admin storageState.
>
> The mockServerAction helper + sample (T018-T020) prove the
> infrastructure is in place; the follow-up audit picks the
> handful of specs where migration genuinely saves wall time.

**Goal**: pull form-validation + UI-feedback specs out of true-E2E since they don't need DB writes.

**Independent Test**: each migrated spec passes at the mocked-E2E layer; corresponding source spec deleted; `pnpm test:e2e` excludes them.

### Implementation

- [ ] T028 [P] [US4] Migrate `C:\_\beeromat\tests\e2e\forms-admin.spec.ts` → `C:\_\beeromat\tests\e2e-mock\admin-forms.spec.ts` (use `mockServerAction` for invite/banking/restock/adjust action responses).
- [ ] T029 [P] [US4] Migrate `C:\_\beeromat\tests\e2e\forms-money.spec.ts` → `C:\_\beeromat\tests\e2e-mock\money-forms.spec.ts`.
- [ ] T030 [P] [US4] Migrate `C:\_\beeromat\tests\e2e\forms-auth.spec.ts` → `C:\_\beeromat\tests\e2e-mock\auth-forms.spec.ts` (mock the magic-link request action).
- [ ] T031 [P] [US4] Migrate `C:\_\beeromat\tests\e2e\ux2-stock-friendlier.spec.ts` → `C:\_\beeromat\tests\e2e-mock\stock-ui.spec.ts` (mock the add/restock/adjust actions).
- [ ] T032 [P] [US4] Migrate `C:\_\beeromat\tests\e2e\ux2-sign-out.spec.ts` → `C:\_\beeromat\tests\e2e-mock\sign-out.spec.ts` (mock the sign-out action; avoids the shared-session-invalidation issue from spec 014).
- [ ] T033 [US4] Run `pnpm test:e2e-mock` — all 5 migrated specs pass. Confirm the corresponding files are gone from `tests/e2e/`.

**Checkpoint**: 5 more specs off true-E2E. US3 + US4 combined have moved 11 specs out of the 33.

---

## Phase 7: User Story 5 — Constitution amendment verified + decision rule in use (Priority: P3) — PARTIAL

> Amendment LANDED with US1 (T015 — Principle VIII + 8-gate list
> + 1.7.0 → 1.8.0 bump). Audit of "next 5 specs default to
> documented layer" (T035 / SC-007) carries forward in BACKLOG
> ("Per-spec true-migration audit").

**Goal**: confirm Principle VIII is doing its job (the amendment shipped with US1 in T015; this phase verifies adoption).

**Independent Test**: a developer can answer "which layer does this test go in?" using the constitution alone. Sampled by reviewing the next 5 specs merged after 015 lands.

### Implementation

- [ ] T034 [US5] Walk a teammate (or self) through the constitution's Principle VIII decision rule for 3 hypothetical test scenarios (e.g., "asserting a button is 44px tall", "asserting a form rejects empty input", "asserting a log-beer round-trip updates the tab"). Confirm the rule gives a clear answer in each case. If any case is ambiguous, refine the wording in `constitution.md`.
- [ ] T035 [US5] Add to `C:\_\beeromat\BACKLOG.md`: a note that the next 5 specs merged after 015 lands should be audited for layer choice (verifying SC-007 = 100% default to a documented layer).

**Checkpoint**: amendment is operational, not just decorative.

---

## Phase 8: Polish — Remaining migrations + 8-gate orchestration + suite-time validation — DEFERRED

> Migration tasks T036-T046 deferred per the US3 + US4 deferrals
> above. The 8-gate orchestration (T047 onwards) runs as part of
> the spec close-out commit but at INFRASTRUCTURE scope only — the
> "≤ 17 min total" target (SC-004) won't measure meaningfully
> until the deferred migrations land.

**Purpose**: cover the remaining ~20 specs (per FR-008a: ALL 33 categorised). Validate the wall-time target (SC-004).

### Remaining hybrid-spec migrations (per research R8)

Each task here moves ONE spec per the R8 categorisation. Some are splits — note the destination(s).

- [ ] T036 [P] Migrate `C:\_\beeromat\tests\e2e\account.spec.ts` — split: display-name edit + DB lockstep scenario stays in true-E2E (with a 1-line rationale comment); stub-row rendering moves to `tests/component/account-stubs.spec.tsx`.
- [ ] T037 [P] Migrate `C:\_\beeromat\tests\e2e\buy-price.spec.ts` — split: add-beer-with-price → true-E2E (kept); US3 member-view-no-margin → `tests/component/log-no-margin.spec.tsx`.
- [ ] T038 [P] Migrate `C:\_\beeromat\tests\e2e\admin-config.spec.ts` — split: bootstrap test → true-E2E (kept); RBAC redirect → `tests/e2e-mock/admin-config-rbac.spec.ts`.
- [ ] T039 [P] Migrate `C:\_\beeromat\tests\e2e\ux-confirm-undo.spec.ts` — split: undo round-trip with DB → true-E2E (kept); "no undo when nothing confirmed" → `tests/e2e-mock/confirm-undo-empty.spec.ts`.
- [ ] T040 [P] Migrate `C:\_\beeromat\tests\e2e\ux-navigation.spec.ts` → `tests/e2e-mock/navigation.spec.ts` (mocks role-gated nav rendering; faster than re-seeding members for each role).
- [ ] T041 [P] Migrate `C:\_\beeromat\tests\e2e\ux2-payment-history.spec.ts` — split: list rendering (scenarios 1, 2, 4) → `tests/component/payment-history-list.spec.tsx`; isolation (scenario 5, DB-touching) → true-E2E (kept).
- [ ] T042 [P] Migrate `C:\_\beeromat\tests\e2e\ux2-polish.spec.ts` — split: money-format helper text → `tests/component/money-helper.spec.tsx`; bet-tally → true-E2E (kept).
- [ ] T043 [P] Migrate `C:\_\beeromat\tests\e2e\ux-forgot-pin.spec.ts` → `tests/e2e-mock/forgot-pin.spec.ts` (mock the password-reset action).
- [ ] T044 [P] Migrate `C:\_\beeromat\tests\e2e\ux3-redesign.spec.ts` → `tests/component/redesign.ct.spec.tsx` (Playwright CT for all 5 visual user stories — colour palette, contrast, touch targets, layout, dark mode).
- [ ] T045 [P] Audit `C:\_\beeromat\tests\e2e\smoke.spec.ts` — decide keep-as-true-E2E vs DELETE (it's a basic smoke; the four-layer test orchestrator may already cover its coverage). Apply decision.

### True-E2E layer keepers (no migration, add rationale comment)

- [ ] T046 [P] Add a 1-line rationale comment at the top of each "keep at true-E2E" spec (per FR-008a). The keepers per R8 are: `auth`, `onboarding`, `us5-invite-onboard`, `email-i18n`, `us1-log-beer`, `us2-settle`, `us3-treasurer-confirm`, `us4-treasurer-manual`, `us6-bet-transfer`, `us7-stock`, `us8-history`, `match-agreement`, `ux2-home-balance`, `db-lifecycle`, `seed-builders`. Comment format: `// Spec 015 — kept at true-E2E layer: <one-sentence reason>`. Single PowerShell loop can stamp them all if desired.

### Gate orchestration verification

- [ ] T047 Run the full 8-gate chain locally and time each: `time pnpm typecheck && time pnpm lint && time pnpm test:unit && time pnpm test:component && time pnpm build && time pnpm test:e2e && time pnpm i18n:check && time pnpm forms:check`. Record numbers; confirm SC-001 (component ≤ 30s), SC-002 (mocked ≤ 90s), SC-003 (true-E2E ≤ 12 min), SC-004 (total ≤ 17 min).
- [ ] T048 If SC-004 misses, do NOT reopen 015 — instead add an entry to `BACKLOG.md` referencing the perf-analysis "Option B" (per-worker DB) as the follow-up spec. Per FR-008a, wall-time is the validation gate, not the stop signal.

### Race-condition validation (SC-006)

- [ ] T049 Reproduce the original lifecycle race fix per `quickstart.md` SC-006: drop the test DB (`docker exec beeromat-postgres psql -U beeromat -c "DROP DATABASE beeromat_test"` + recreate from `docker-compose` init script), run `pnpm test:e2e` from cold, assert NO "relation X does not exist" timeout fires.

### Lockfile + final ship

- [ ] T050 Verify `pnpm install` reports no diff (constitution VII). Run `pnpm i18n:check` + `pnpm forms:check` for completeness (already covered by T047 but explicit pass here for any post-T046 file edits).
- [ ] T051 Mark spec as Shipped in `C:\_\beeromat\specs\015-testing-pyramid-split\spec.md` (change `Status: Draft` → `Status: Shipped (YYYY-MM-DD)`); update `C:\_\beeromat\CLAUDE.md`'s SPECKIT block to point at the next active spec (or leave as 015 if no successor yet). Conventional Commits per constitution: `feat(015): testing pyramid split — final commit`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 (verify baseline) → T002 (install dep) → T003 (verify existing deps). T003 [P] with T002.
- **Foundational (Phase 2)**: T004 → T005 → T006 sequential (db.setup creation → config wiring → globalSetup deletion). T007 → T008 [P]. T009, T010, T011, T012 all [P] (different files).
- **US1 (Phase 3)**: T013 + T014 [P] (different files). T015 + T016 [P] (constitution + template, different files). T017 final verification.
- **US2 (Phase 4)**: T018 → T019 → T020 sequential.
- **US3 (Phase 5)**: T021–T026 all [P] (one per spec, different files). T027 final verification.
- **US4 (Phase 6)**: T028–T032 all [P]. T033 final verification.
- **US5 (Phase 7)**: T034 + T035 sequential.
- **Polish (Phase 8)**: T036–T046 all [P] (different files). T047 → T048 → T049 → T050 → T051 sequential.

### User story dependencies

- US1 is MVP — ships the layer + the amendment. Standalone.
- US2 ships the mocked-E2E layer — depends only on Phase 2 infra.
- US3 ships migrations to the component layer — depends on US1 (proves the layer works).
- US4 ships migrations to the mocked layer — depends on US2.
- US5 verifies the amendment landed in US1 — independent.

### Parallel opportunities

- Phase 2: 5 of 9 tasks are [P] (different files).
- Phase 5 (US3): all 6 migration tasks [P] — one developer can do them serially in ~30 min total, OR several can be in flight simultaneously.
- Phase 6 (US4): all 5 migration tasks [P].
- Phase 8 (Polish): all 10 migration + cleanup tasks [P]; only the validation tasks T047-T051 must be sequential.

---

## Parallel Example: User Story 3 (after Foundational + US1 land)

```bash
# Round 1 — 6 migrations in parallel:
Task: "T021 [P] [US3] Migrate ux-i18n.spec.ts → tests/component/i18n-rendering.spec.tsx"
Task: "T022 [P] [US3] Migrate ux-bet-no-session.spec.ts → tests/component/bet-empty-state.spec.tsx"
Task: "T023 [P] [US3] Migrate ux-loading.spec.ts → tests/component/loading-skeleton.spec.tsx"
Task: "T024 [P] [US3] Migrate ux2-guidance.spec.ts → tests/component/guidance-banners.spec.tsx"
Task: "T025 [P] [US3] Migrate ux-touch-targets.spec.ts → tests/component/touch-targets.ct.spec.tsx"
Task: "T026 [P] [US3] Migrate ux-pending-row.spec.ts → tests/component/pending-row.ct.spec.tsx"

# Round 2 — verification:
Task: "T027 [US3] Run pnpm test:component + pnpm test:component:visual; confirm 6 specs pass"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (T001-T003) — setup.
2. Phase 2 (T004-T012) — foundational infra.
3. Phase 3 (T013-T017) — component layer + constitution amendment.
4. **STOP and VALIDATE**: `pnpm test:component` runs the BrandMark sample green; the constitution shows the new Principle VIII.
5. Ship as a focused commit.

### Incremental delivery

1. Setup + Foundational → infra ready.
2. US1 → MVP demoable (component layer + amendment).
3. US2 → mocked-E2E layer demoable.
4. US3 + US4 in parallel → 11 specs out of true-E2E. **First real wall-time wins.**
5. Polish (T036-T046) → all 33 categorised (FR-008a definition of done).
6. Polish (T047-T051) → gates green + ship.

### Solo developer cadence

- Phase 1 + 2 in one sitting (~2-3 h): install dep, scaffold configs, create db.setup project.
- US1 in one sitting (~3-4 h): two sample tests (RTL + CT) + constitution amendment + verify.
- US2 in one sitting (~2 h): mockServerAction helper + sample test.
- US3 + US4: ~30 min per migration × 11 specs ≈ ~5-6 h spread over a couple of sessions.
- Polish migrations (T036-T046): ~30 min × 10-15 splits ≈ ~5-7 h.
- Final validation + ship (~2 h).
- **Total: ~20-25 h of focused work**.

---

## Notes

- Every task is verifiable: tests are backed by `pnpm test:component` / `pnpm test:e2e-mock` / `pnpm test:e2e` gates; constitution edits backed by manual diff review; gate orchestration backed by `time` measurements vs the SCs.
- Every user-story task carries its US label. Setup / Foundational / Polish do not.
- Absolute paths so commands like `Read` + `Edit` work without ambiguity.
- The Phase-8 verification chain is the canonical "feature is done" signal. The wall-time validation (T047) is informational per FR-008a — if it misses SC-004, we ship anyway and queue the perf follow-up (T048).
- Conventional Commits style per constitution: `feat(015): T0NN ...` or grouped per user story.
