---

description: "Task list for the Fresh-Install Onboarding Wizard (v1.9)"
---

# Tasks: Fresh-Install Onboarding Wizard (v1.9)

**Input**: Design documents from `specs/009-fresh-install-onboarding/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/onboarding.md](./contracts/onboarding.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The constitution's seven verification gates (notably gate 3 `pnpm test:unit` and gate 5 `pnpm test:e2e`) require unit + Playwright tests for every Acceptance Scenario; the spec marks every story with explicit Independent Test criteria, all of which need observable verification.

**Organization**: Tasks are grouped by user story so each story is independently implementable and independently testable per the constitution's "Verifiable Tasks" rule (Spec & Task Discipline).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Each task lists the exact file path it touches and (where applicable) the verifier gate that observes its completion

## Path Conventions

beeromat is a single Next.js 16 application at the repository root. Source lives under `app/`, `lib/`, `components/`; tests under `tests/unit/` and `tests/e2e/`; i18n catalogs under `messages/`. Per plan.md's Project Structure section.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Strings the wizard form will render. Lives in Setup (not Foundational) because no behaviour depends on it — only UI does — and adding catalog keys can land before any other task.

- [X] T001 [P] Add `onboarding.*` namespace to `messages/cs.json` and `messages/en.json` with all wizard strings (title, subtitle, four field labels + placeholders + helper text, submit button, validation error messages for each field, post-submit confirmation copy, `BOOTSTRAP_ALREADY_COMPLETE` friendly message). Czech and English parity required from the first commit. **Verifier**: `pnpm i18n:check` passes; both catalogs have identical key sets.

**Checkpoint**: Catalog keys exist — Foundational phase can reference them in error-message paths.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reusable building blocks the User Story phases all depend on — the Zod schema, the bootstrap-state query helper, and their unit tests. **⚠ No US phase work begins until Phase 2 is green.**

- [X] T002 [P] Create `lib/validation/onboarding.ts` exporting `onboardingSchema` (composes `clubConfigSchema` from `lib/validation/admin-config.ts` for the three club fields, adds `adminEmail` field with trim + lowercase + Zod `z.email()` shape; currency field uses `.transform((v) => v.toUpperCase())` before regex per research.md §6). Per data-model.md §3. **Verifier**: `pnpm typecheck` + `pnpm lint`.
- [X] T003 [P] Create `lib/db/queries/bootstrap-state.ts` exporting `isFreshDeployment()` and `invalidateFreshDeploymentCache()` with the module-level sticky-false cache per research.md §2 and the contract block in contracts/onboarding.md §2. The COUNT query is the two-table form `SELECT (SELECT count(*) FROM clubs) AS clubs, (SELECT count(*) FROM "user") AS users` to keep the proxy hit to one roundtrip while the cache is `null`. **Verifier**: `pnpm typecheck` + `pnpm lint`.
- [X] T004 [P] Create `tests/unit/bootstrap-state.spec.ts` covering: (a) `null → true` (queries DB when fresh), (b) `null → false` (queries DB when populated, caches false), (c) `false → false` (sticky, no requery), (d) `invalidateFreshDeploymentCache()` resets to `null` and the next call queries DB. Uses `vi.mock('@/lib/db/client')` with PGlite per the spec 008 `bootstrap-rule.spec.ts` pattern. **Verifier**: `pnpm test:unit`.
- [X] T005 [P] Create `tests/unit/onboarding-schema.spec.ts` covering every validation rule from data-model.md §3: club name boundary at 0/1/120/121 chars, currency `czk` accepted (uppercased to `CZK`), currency `CZ` (2 letters) rejected, currency `CZK1` rejected, locale `cs` and `en` accepted, locale `de` rejected, malformed emails rejected, valid emails normalised (trim + lowercase). **Verifier**: `pnpm test:unit`.

**Checkpoint**: Schema + cache helper + their tests pass. User story phases can now start in parallel.

---

## Phase 3: User Story 1 — First visitor bootstraps the club via the wizard (Priority: P1) 🎯 MVP

**Goal**: Pavel opens a freshly deployed URL on his phone, gets redirected to `/setup`, fills four fields, submits, receives a magic-link email in his chosen locale, clicks it, lands on the home screen as `club_admin` on a fully-configured club. End-to-end self-bootstrap with zero terminal steps.

**Independent Test**: Per spec.md US1 Independent Test — fresh DB, hit `/` in clean browser → redirect to `/setup` → submit happy values → all four DB conditions hold (clubs row, banking row, users row with `emailVerified=false`, no members row yet) → email in Mailpit in chosen locale → click link → members row inserted with `role='club_admin'` → user lands authenticated.

### Implementation for User Story 1

- [X] T006 [US1] Create `app/[locale]/setup/actions.ts` exporting `bootstrapClubAction(input)` per the contract in contracts/onboarding.md §1. Imports `onboardingSchema` (T002) for validation, opens a Drizzle transaction acquiring `pg_advisory_xact_lock(1008)` (same key as `lib/auth/bootstrap.ts:39` and `lib/auth/actions.ts:184`), rechecks state X, inserts clubs + banking + user rows, calls `invalidateFreshDeploymentCache()` (T003) post-commit, sets `NEXT_LOCALE` cookie to the chosen `defaultLocale` per research.md §3, calls `auth.api.signInMagicLink({ body: { email }, headers })`, calls `revalidatePath('/', 'layout')`, returns `{ ok: true, code: 'OK' }`. Failure modes return `VALIDATION_FAILED` (with `fieldErrors`) or `BOOTSTRAP_ALREADY_COMPLETE`. Uses `'use server'`. **Verifier**: `pnpm typecheck` + `pnpm lint`.
- [X] T007 [P] [US1] Create `app/[locale]/setup/SetupWizardForm.tsx` (client component, `'use client'`). React-hook-form + `zodResolver(onboardingSchema)` (T002). Four fields: club name (`Input`), currency (`Input`), default locale (`Select` populated from `routing.locales`), admin email (`Input` with `type="email"` as keyboard hint only — validation is from the schema). Submit calls `bootstrapClubAction` (T006); on `code: 'OK'` `router.push('/sign-in?bootstrap-sent=1')`; on `VALIDATION_FAILED` maps `fieldErrors` to RHF `setError` per field; on `BOOTSTRAP_ALREADY_COMPLETE` renders the `onboarding.bootstrapAlreadyComplete` friendly message + link to `/sign-in`. Includes `BrandMark` from `components/ui/brand-mark.tsx` at top. **Verifier**: `pnpm typecheck` + `pnpm lint` + `pnpm forms:check` (no native validation: no `required`, no `pattern`, no native date/time inputs).
- [X] T008 [P] [US1] Create `app/[locale]/setup/page.tsx` (server component). Imports `SetupWizardForm` (T007). Calls `getTranslations({ namespace: 'onboarding' })` to verify catalog is reachable from this route group (smoke), renders `<main>` wrapper matching spec 008's `/admin/config` page layout, drops `<SetupWizardForm />` inside. **Verifier**: `pnpm typecheck` + `pnpm lint` + `pnpm build`.
- [X] T009 [US1] Modify `proxy.ts` (repository root) — extend `proxy(request)` to call `isFreshDeployment()` (T003). If `true` AND the path is not `/setup` or `/<locale>/setup`, redirect to `/<resolved-locale>/setup` per the decision matrix in contracts/onboarding.md §2 (URL prefix > NEXT_LOCALE cookie > routing.defaultLocale; default-locale `cs` is unprefixed). If `true` AND the path IS the setup route, hand off to `intlMiddleware` as today (let the wizard render). Existing `NEXT_LOCALE` cookie redirect for non-prefixed paths runs BEFORE this check. **Verifier**: `pnpm typecheck` + `pnpm lint` + `pnpm build`.
- [X] T010 [US1] Create `tests/unit/onboarding-action.spec.ts` covering the US1-relevant action behaviours: happy-path submit (state X → all three rows inserted with correct values, `invalidateFreshDeploymentCache` called, `signInMagicLink` invoked with expected args), validation-failure short-circuit (Zod fail returns `VALIDATION_FAILED`, no DB writes, no email). Uses `vi.mock('@/lib/db/client')` + PGlite; mocks `auth.api.signInMagicLink` to assert call shape without dispatching a real email. **Verifier**: `pnpm test:unit`.
- [X] T011 [US1] Create `tests/e2e/onboarding.spec.ts` with the US1 happy-path Playwright scenario per quickstart.md steps 1–8: fresh DB via `db:reset` fixture (extend `tests/e2e/fixtures/seed.ts` if needed — DO NOT use `db:seed`), navigate to `/`, assert redirect to `/setup`, fill the four fields (currency entered lowercase to verify the transform), submit, assert redirect to `/sign-in?bootstrap-sent=1`, fetch Mailpit's HTTP API to assert one email exists for the entered address with Czech subject (`Tvůj přihlašovací odkaz do beeromatu` — matches `messages/cs.json` `emails.magicLink.subject`), extract magic-link URL from Mailpit body, navigate to it, assert landing at `/`, query DB and assert `members` row with `role='club_admin'` for the user. **Verifier**: `pnpm test:e2e`.

**Checkpoint**: US1 fully functional in isolation. Pavel-the-fresh-admin flow works end-to-end. The proxy's state-X redirect handles getting INTO the wizard; the action handles the bootstrap transaction; the form handles submit; spec 008's existing hook handles promotion at verify time.

---

## Phase 4: User Story 2 — `/setup` is invisible once bootstrapped (Priority: P1)

**Goal**: After US1 has happened once (or `pnpm db:seed` has been run), `/setup` is unreachable. Anonymous → /sign-in. Signed-in (any role) → /. Crafted POST to the action → `BOOTSTRAP_ALREADY_COMPLETE`. This is the safety counterweight that makes US1 safe to ship.

**Independent Test**: Per spec.md US2 Independent Test — with one club + one user in DB, navigate to `/setup` as anonymous (3xx → `/sign-in`), as signed-in member (3xx → `/`), as signed-in admin (3xx → `/`). Crafted POST to action returns `BOOTSTRAP_ALREADY_COMPLETE` with zero side effects.

### Implementation for User Story 2

- [ ] T012 [US2] Extend `proxy.ts` (sequential with T009 — same file): add the post-bootstrap leg of the decision matrix. When `isFreshDeployment()` returns `false` (sticky cache hit) AND the path IS `/setup` or `/<locale>/setup`, redirect to `/<resolved-locale>/sign-in` if no Better Auth session cookie present, else to `/<resolved-locale>/`. Locale resolution rules unchanged from T009. Cookie presence is the cheap gate; full session validation continues to happen in destination routes. **Verifier**: `pnpm typecheck` + `pnpm lint` + `pnpm build`.
- [ ] T013 [US2] Audit `bootstrapClubAction` (T006) for the FR-012 defence-in-depth: confirm the in-transaction recheck (COUNT clubs + COUNT users after acquiring the advisory lock) is present and returns `BOOTSTRAP_ALREADY_COMPLETE` without inserting if either count > 0. Add an inline comment citing FR-012. If T006 already includes this (it should), this task is a verification + comment task; if missing, add it. **Verifier**: `pnpm typecheck` + test T014 below.
- [ ] T014 [P] [US2] Extend `tests/unit/onboarding-action.spec.ts` (T010) with US2-specific cases: (a) precondition violated at submit time (insert a clubs row before calling the action → asserts `BOOTSTRAP_ALREADY_COMPLETE`, no second clubs row inserted, no email dispatched), (b) race safety via `Promise.all([action(input1), action(input2)])` on a true-fresh DB → asserts exactly ONE returns `OK`, the other returns `BOOTSTRAP_ALREADY_COMPLETE`, exactly ONE clubs row exists post-test. **Verifier**: `pnpm test:unit`.
- [ ] T015 [US2] Extend `tests/e2e/onboarding.spec.ts` (T011) with US2 acceptance scenarios: (a) seed DB into state B (one club + one user — use `db:seed` fixture), navigate to `/setup` anonymous → assert redirect to `/sign-in`; (b) sign in as a regular member, navigate to `/setup` → assert redirect to `/`; (c) attempt a direct POST to the action route via Playwright's `request.post()` → assert response surfaces `BOOTSTRAP_ALREADY_COMPLETE` (or equivalent error), then assert clubs count is still 1 in DB. **Verifier**: `pnpm test:e2e`.

**Checkpoint**: US2 fully functional. Standa and Tereza (P1/P3 invisibility canaries) never see `/setup` again. US1 + US2 ship as a coherent unit (US2 isolates the safety boundary US1 opened).

---

## Phase 5: User Story 3 — Wizard input validation (Priority: P2)

**Goal**: Bad input never produces a generic 500 or unintelligible server error. Every validation rule renders inline on the form with localised copy, preserving the user's prior input.

**Independent Test**: Per spec.md US3 Independent Test — bad inputs (empty name, too-long name, 2-letter currency, locale outside routing.locales, malformed email) → inline errors render, no rows inserted, no email dispatched, prior valid field values preserved.

### Implementation for User Story 3

- [ ] T016 [US3] Audit `SetupWizardForm` (T007) for FormMessage wiring: each field MUST have `<FormMessage />` directly under its `FormControl`, rendering the schema's error message (mapped to the `onboarding.errors.*` catalog key matching the failed rule). Confirm the form's `onSubmit` handler does NOT clear other fields when one field errors (RHF default — verify not overridden). **Verifier**: `pnpm typecheck` + `pnpm forms:check` + test T017 below.
- [ ] T017 [US3] Extend `tests/e2e/onboarding.spec.ts` (T011) with US3 acceptance scenarios from spec.md: (a) Pavel submits currency `CZ` → assert inline error visible on the currency field with the Czech catalog string, assert other fields' values preserved, assert DB clubs count still 0, assert Mailpit inbox count still 0; (b) Pavel submits a 121-char club name → assert inline error on club-name field, other fields preserved. **Verifier**: `pnpm test:e2e`.

**Checkpoint**: US3 covered. The "first-impression-matters" UX layer is in place; validation errors render as designed, not as 500s.

---

## Phase 6: User Story 4 — Wizard renders in both supported locales (Priority: P2)

**Goal**: Every wizard string is fully i18n'd; the form is visually + behaviourally identical between `/cs/setup` and `/en/setup`; switching locale mid-form preserves field values.

**Independent Test**: Per spec.md US4 Independent Test — hit `/cs/setup` and `/en/setup`, every string translated, `pnpm i18n:check` passes, locale switch preserves input.

### Implementation for User Story 4

- [ ] T018 [US4] Verify that `app/[locale]/setup/page.tsx` (T008) inherits the locale switcher from the existing `[locale]` layout. If the existing layout's switcher only renders for the `(auth)` and `(app)` route groups (not for top-level pages under `[locale]/`), refactor so it appears on `/setup` too — likely by extracting the switcher into `components/nav/language-switcher.tsx` (if not already) and rendering it inside `app/[locale]/setup/page.tsx`'s header section above `BrandMark`. **Verifier**: `pnpm typecheck` + `pnpm i18n:check`.
- [ ] T019 [US4] Extend `tests/e2e/onboarding.spec.ts` (T011) with US4 acceptance scenarios: (a) `tests/e2e/onboarding.spec.ts` parameterised over both locales — submit the wizard with Czech UI and assert the magic-link email subject is in Czech (`emails.magicLink.subject` `cs`), reset DB, then submit with English UI and `defaultLocale=en` and assert the magic-link email subject is in English; (b) navigate to `/cs/setup`, type "Test club" into club name field, click the language switcher to `en`, assert URL became `/en/setup`, assert the "Test club" value is preserved in the now-English-labelled club-name field. **Verifier**: `pnpm test:e2e` + `pnpm i18n:check`.

**Checkpoint**: US4 covered. Tereza's i18n canary stays green; copy quality (the wording itself) remains a human review at PR/commit time per the constitution.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T020 [P] Update `scripts/db-reset.ts` header comment block — promote `pnpm db:reset` (bare) to the canonical "test the v1.9 wizard from true-fresh state" command in the docstring; keep `pnpm db:reset:bootstrap` documented but mark it as "skips the wizard; tests the spec 008 promotion path in isolation". No behavioural change. **Verifier**: existing `pnpm db:reset` + `pnpm db:reset:bootstrap` commands still run without error (manual diff review confirms doc-only change).
- [ ] T021 Manual quickstart walk — execute `specs/009-fresh-install-onboarding/quickstart.md` steps 1–11 plus the three failure-mode verifications, on the local dev stack with Mailpit. Confirm timing meets SC-001 (under 90 seconds end-to-end on mobile-emulated viewport in DevTools). Note the elapsed time in the spec's Status when promoting it to "Implemented". **Verifier**: manual sign-off referenced in the commit message that closes this task.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001)**: independent, can start immediately.
- **Foundational (Phase 2, T002–T005)**: depends on T001 only for the error-message keys referenced from the schema's error map. T002–T005 are otherwise independent of one another and run in parallel.
- **US1 (Phase 3, T006–T011)**: depends on Phase 2 complete (T002 + T003 + tests passing).
- **US2 (Phase 4, T012–T015)**: depends on US1 T006 + T007 + T009 (extends the same files). Logically sequential after US1's wizard exists and the proxy is partially wired.
- **US3 (Phase 5, T016–T017)**: depends on US1 T007 (form) + T011 (E2E file exists to extend). Can start as soon as US1's form is in code review.
- **US4 (Phase 6, T018–T019)**: depends on US1 T008 (page) + T011 (E2E file). Can start in parallel with US3 once US1 is done.
- **Polish (Phase 7, T020–T021)**: depends on all stories complete.

### User Story Dependencies

- US1 → US2: structurally sequential because US2 extends the same `proxy.ts` and the same `tests/e2e/onboarding.spec.ts` US1 created. Could be parallelised by splitting into two PRs but the file-overlap makes sequential cheaper.
- US3, US4: independent of each other once US1's form + page + E2E shell exist. Run in parallel.

### Within Each User Story

- Validation schema (Foundational) before action (US1) before form (US1) before page (US1) before proxy (US1) before E2E (US1).
- For US2/US3/US4: the implementation tasks extend artifacts US1 already wrote — sequential within the story, but tests can be authored in parallel with the implementation extension (TDD-style red-then-green).
- Verification gates run after each task per the constitution's "test/lint/build green before push" discipline.

### Parallel Opportunities

- **Phase 1**: T001 alone (no parallelism within the phase).
- **Phase 2**: T002, T003, T004, T005 all [P] — four files, zero overlap. Burn down in parallel.
- **Phase 3 (US1)**: T007 + T008 [P] (form file + page file are different; both depend on T006 but neither imports the other directly).
- **Phase 4 (US2)**: T014 [P] (test file extension is independent of T012/T013).
- **Phase 5 (US3)**: T016 + T017 share the form file but T017 is the test that observes T016 — sequential.
- **Phase 6 (US4)**: T018 + T019 — different files, [P] if T011's E2E file exists.
- **Phase 7**: T020 [P], T021 sequential after everything else.

---

## Parallel Example: Phase 2 Foundational

```text
# All four can run simultaneously — different files, no shared state:
Task: "Create lib/validation/onboarding.ts (T002)"
Task: "Create lib/db/queries/bootstrap-state.ts (T003)"
Task: "Create tests/unit/bootstrap-state.spec.ts (T004)"  # depends on T003 — start as soon as T003 is committed
Task: "Create tests/unit/onboarding-schema.spec.ts (T005)" # depends on T002 — start as soon as T002 is committed
```

## Parallel Example: User Story 1 implementation

```text
# After T006 (action) is committed, T007 + T008 + T009 all start in parallel:
Task: "Create app/[locale]/setup/SetupWizardForm.tsx (T007)"     # different file
Task: "Create app/[locale]/setup/page.tsx (T008)"                # different file
Task: "Modify proxy.ts: add isFreshDeployment redirect (T009)"   # different file
# T010 (action unit test) runs alongside since it imports the committed T006.
# T011 (E2E) runs LAST in US1 — needs everything in place.
```

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 (catalog keys) → T002–T005 (foundational) → T006–T011 (US1).
2. **STOP & VALIDATE**: Run quickstart.md steps 1–9 manually + `pnpm test:unit` + `pnpm test:e2e`. Pavel-on-fresh-deploy demo is shippable here in isolation.
3. Optionally merge to `main` at this point per the trunk-based discipline; US2/3/4 land in subsequent commits on the same branch.

### Incremental Delivery (Recommended)

1. Phase 1–3 → MVP (US1) → spec demonstrates the persona-blocker is fixed.
2. Phase 4 (US2) → safety counterweight ships → US1 is now safe to leave on by default.
3. Phase 5 + Phase 6 in parallel (different developers OR same developer back-to-back).
4. Phase 7 → polish + manual sign-off → merge to `main`.

### Single-Developer Strategy

Linear: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021. Each task ~15-45 min; whole spec implementable in roughly one focused day, mostly because spec 008 already shipped the heavy lifting (advisory lock pattern, promotion hook, Mailpit integration, PGlite test rig, E2E fixtures).

---

## Notes

- [P] = different files, no dependency on incomplete tasks.
- [Story] label maps task to spec.md user story for traceability — commits MUST reference `[US1]` / `[US2]` / `[US3]` / `[US4]` per the constitution's Development Workflow & Quality Gates rule.
- Every task has a named verifier gate (one of the seven `pnpm` gates, or a Playwright assertion, or a unit test) — per the constitution's "Verifiable Tasks" rule. T020 is the only doc-only task; its verifier is "the existing commands still run without error" (manual diff review).
- Tests are AUTHORED ALONGSIDE the implementation in this spec (not strict TDD), matching the established beeromat rhythm — schema + action + unit test in one commit pair; page + form + E2E in another.
- Commit cadence: one commit per task, OR one commit per logical group (e.g., "Phase 2 foundational" as one commit if all four tasks are tightly coupled). Conventional Commits format with `[Txxx]` and `[USx]` references.
- Stop at the US1 checkpoint to validate the MVP independently before continuing to US2.
- Anti-pattern to avoid: do NOT add Turnstile to the wizard mid-implementation as a "quick fix" — that's a Complexity Tracking deferral per the plan; reopen as a follow-up spec if real deployment data warrants it.
