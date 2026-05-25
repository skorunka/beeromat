# Feature Specification: Testing Pyramid Split (v1.15)

**Feature Branch**: `015-testing-pyramid-split`

**Created**: 2026-05-25

**Status**: Infrastructure shipped 2026-05-26. US1 (component layer + Constitution Principle VIII) + US2 (mocked-E2E sample) committed. US3/US4 bulk migrations DEFERRED to follow-up specs (presentational-component extraction + per-spec migration audit) per implementation-phase analysis — see BACKLOG.md.

**Input**: User description (2026-05-25): rework the E2E test architecture
into a proper testing pyramid. Spec 014's storageState reuse work removed
the per-test sign-in cost but didn't fix the architectural mismatch: today
100% of the ~120 tests are end-to-end (Playwright + production build +
real Postgres), which inflates suite wall time, masks a `globalSetup` vs
`webServer` race condition (the "relation clubs does not exist" timeout
surfaced during 014 validation), and slows iteration. Split into four
layers — unit (existing), component (new), API-mocked E2E (new), true
E2E (slimmed) — per industry guidance on the testing pyramid.

## Personas

- **P1 — Solo developer iterating on a UI tweak**: changes a Tailwind
  class on the home greeting, wants the UI-relevant test suite to run
  in under 30 seconds so they can TDD. Today they pay the ~80s
  webserver cold-build tax for every change.
- **P2 — CI runner on a trunk-based push**: the project commits
  straight to `main` (constitution). Total test suite must fit in a
  ~15-minute budget for fast feedback. Today's full E2E suite trends
  toward 30+ minutes and the lifecycle race adds flake.
- **P3 — Future-feature engineer authoring a new spec**: writes a new
  `tests/...` file. Should know — from the constitution + a one-line
  decision tree — which layer to put each test in. Today there is only
  one layer (E2E), so every assertion defaults there even when a
  component test would suffice.

## Clarifications

### Session 2026-05-25

- Q: Which runner anchors the new component layer? → A: Hybrid — **Vitest + React Testing Library as the default** for fast behavioural / locale / empty-state tests (jsdom, <100ms/test), with **Playwright Component Testing for the small visual subset** that needs real CSS (~5-10 tests in `ux3-redesign` that assert computed colour, font family, touch-target dimensions, contrast). Two configs to maintain; one new dep (`@playwright/experimental-ct-react`).
- Q: Which fix approach for the `globalSetup` vs `webServer` ordering race? → A: Add a new **`db.setup.ts` Playwright project** that owns schema migration. The true-E2E `chromium` project (and `auth.setup.ts`) declare a dependency on `db.setup`, so Playwright runs migration BEFORE the webserver URL probe. The legacy `globalSetup` config option is deleted. Single owner of DB lifecycle, uses Playwright's official project-dependency mechanism (per Microsoft Playwright issue #19571).
- Q: Mocked-E2E layer — shared webserver or separate? → A: **One shared production webserver** for mocked-E2E + true-E2E. `page.route()` interceptors are per-BrowserContext so mocked specs don't leak to true-E2E specs. Single webserver boot amortised across both layers; mocked tests run against the same Next.js production runtime as true E2E (no parity gap).
- Q: When does the constitution amendment land? → A: **Bundle** — the amendment ships in the same commit as US1's component-layer infrastructure. One trip through the gates; the new principle has working proof-of-concept code to anchor it from day one. Avoids the gap where migrations are in flight under unwritten rules.
- Q: What counts as "the migration is complete"? → A: **All 33 specs categorised + moved** to their target layer (or kept in true-E2E with a 1-line documented reason). Categorisation is the discrete work; SC-004's wall-time target (≤17min) becomes the *validation gate that proves the work was worthwhile*, not the stop signal. If categorisation completes but wall-time misses, that triggers a follow-up perf spec (Option B from the perf analysis — per-worker DB) rather than reopening 015.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Component layer exists and one spec runs against it (Priority: P1)

**Why this priority**: this IS the proof-of-concept. Without a working
component-layer runner, none of the other layers' value materialises.
Shipping just US1 delivers a working `pnpm test:component` command + a
sample test that runs without booting a webserver or touching the DB.

**Independent Test**: a developer runs `pnpm test:component`; a single
component-layer test renders the `BrandMark` component (or similar
trivial component), asserts on its output, and the command exits
green in under 10 seconds total. No production build, no Docker
dependency, no `.env.test`.

**Acceptance Scenarios**:

1. **Given** the component-layer tooling is installed and configured,
   **When** the developer runs `pnpm test:component`, **Then** at
   least one component-layer test runs and reports pass/fail without
   requiring `pnpm build` or `pnpm start`.
2. **Given** the same component-layer test, **When** the developer
   tweaks a styling prop on the rendered component, **Then**
   re-running `pnpm test:component` reflects the change in under 10
   seconds end-to-end (cold) and under 3 seconds (warm).

---

### User Story 2 — API-mocked E2E layer exists and one spec runs against it (Priority: P2)

**Why this priority**: the second new layer. Validates that the
intermediate "webserver up, Server Actions intercepted" pattern works
for form-validation and toast-rendering scenarios. Until US2, every
form-validation test must stay in true E2E.

**Independent Test**: a developer runs `pnpm test:e2e-mock` (or
chosen command name); a sample test navigates to a form, fills bad
input, clicks submit, and asserts the in-app error message renders.
The Server Action is intercepted via `page.route()` — no DB write
attempted. Webserver boots once for the layer; total runtime for the
sample test ≤ 90 seconds end-to-end.

**Acceptance Scenarios**:

1. **Given** the API-mocked E2E tooling is configured, **When** the
   developer runs the layer's command, **Then** the webserver boots
   once, the sample test runs, and the layer exits green without
   issuing any real Server Action calls (verifiable by checking the
   real test DB has no inserts from the run).

---

### User Story 3 — At least 4 currently-E2E specs migrated to the component layer (Priority: P2)

**Why this priority**: turns the proof-of-concept into measurable
suite-wide savings. The migration target subset is the most clearly
visual specs (`ux3-redesign`'s US1+US2, `ux-touch-targets`,
`ux-loading`, parts of `ux2-polish`). Each migration removes
~webserver-tax cost from a chunk of the suite.

**Independent Test**: pick 4 specs from the migration candidate
list; convert each to the component layer; run
`pnpm test:component` and `pnpm test:e2e`; assert both pass and the
migrated specs no longer appear in the E2E run.

**Acceptance Scenarios**:

1. **Given** the migration of 4 candidate specs is complete,
   **When** the developer runs the full test suite, **Then** the 4
   migrated specs pass at the component layer AND do NOT run as
   true E2E (no duplicate coverage).
2. **Given** the migration is complete, **When** the developer
   compares the new true-E2E wall time to the pre-migration
   baseline, **Then** the true-E2E wall time has dropped by at
   least the cumulative cost the 4 specs previously contributed.

---

### User Story 4 — At least 4 currently-E2E specs migrated to the API-mocked layer (Priority: P3)

**Why this priority**: parallel to US3 but for the API-mock layer.
Migration targets: `forms-admin`, `forms-money`, `forms-auth`,
parts of `account` — specs whose assertions are about UI feedback
on form submission, not about whether the DB write actually
happened.

**Independent Test**: convert 4 form-validation tests to the
mocked-E2E layer; run the full suite; confirm all pass + true-E2E
runtime drops accordingly.

**Acceptance Scenarios**:

1. **Given** the migration of 4 candidate specs is complete,
   **When** the suite runs, **Then** the mocked-layer tests pass
   AND the original DB-touching tests have been removed (no
   duplicate coverage).

---

### User Story 5 — Constitution amendment documenting the four-layer pyramid (Priority: P3)

**Why this priority**: codifies the layering so future specs default
to the right layer. Without it, the layer choice slowly drifts back
to "everything is E2E" (the path of least resistance for any single
new spec).

**Independent Test**: open `.specify/memory/constitution.md` — there
is a new Principle (VIII or higher) titled "Testing Pyramid" or
similar that names the four layers, gives a one-paragraph decision
guide for each, and lists the gate commands. New specs reference it.

**Acceptance Scenarios**:

1. **Given** the amended constitution, **When** a developer asks
   "which layer should I put this new test in?", **Then** the
   constitution gives them a clear answer based on what the test
   asserts (visual / form-validation / journey).
2. **Given** the amended constitution, **When** a verification gate
   runs on a PR adding new tests, **Then** there is a check or
   reviewer cue that the new tests respect the layering (could be
   manual reviewer guidance; doesn't need to be automated for v1).

---

### Edge Cases

- **A spec mixes layers**: e.g., `ux3-redesign` has 5 visual
  scenarios + 1 scenario that touches a member screen. The visual 5
  move to the component layer; the 1 stays in true E2E. The spec
  file is split, OR the test file lives at the higher layer with
  the visual scenarios marked to run only there (per-`test.use()`
  is too complex; splitting files is simpler).
- **A "form validation" test asserts the DB row was written on
  success**: this is actually two assertions (UI feedback + DB
  state). The UI feedback half moves to mocked-E2E; the DB-state
  half is either kept in true E2E or migrated to a unit/integration
  test against the action helper.
- **Component-layer test needs domain-shaped data**: use static
  TypeScript fixtures, not a real query. The component renders the
  fixture; no DB involved.
- **Browser-only matchers** (visual contrast, computed CSS, font
  family): these tests go under the **Playwright CT branch** of
  the component layer (per Q1 — real CSS available). Jsdom-only
  tests under Vitest + RTL cannot assert pixel-level properties.
  The decision rule: if a test calls `getComputedStyle()`, asserts
  a `boundingBox()`, or compares a colour via WCAG contrast math,
  it's a Playwright CT test.
- **Locale-rendering tests need both EN and CS**: parameterise the
  component test (one test, two locales) rather than splitting into
  two files.
- **The migration leaves an empty E2E spec file** (every scenario
  moved out): delete the file; don't keep a placeholder.
- **A spec on the "true E2E" keep-list is found, on inspection, to
  only assert UI**: move it. The keep-list in the description is
  the starting heuristic, not gospel; per-file inspection wins.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The test suite MUST be organised into FOUR distinct
  layers: unit (existing), component (new), API-mocked E2E (new),
  true E2E (slimmed from current).
- **FR-002**: Each layer MUST have its own `pnpm` command and run
  independently of the others (e.g., the component layer MUST run
  with no Docker dependency, no webserver build, no `.env.test`).
- **FR-003**: A top-level `pnpm test` command MUST orchestrate all
  four layers in a sensible order (fastest first) and fail fast.
- **FR-004**: The component layer MUST be capable of rendering
  components in isolation. Behavioural / locale / empty-state
  tests run under **Vitest + React Testing Library (jsdom)** for
  speed; the smaller subset of tests asserting computed CSS
  properties (colour, contrast, font, touch-target size) runs
  under **Playwright Component Testing** so real Tailwind styling
  is applied. Both share the `tests/component/` directory but use
  separate config files + commands.
- **FR-005**: The API-mocked E2E layer MUST allow intercepting
  Server Action endpoints (via `page.route()` or equivalent) so
  tests can simulate success and failure responses without DB
  writes. The mocked layer SHARES the production webserver with
  the true-E2E layer (one boot, both consume it); interceptors
  are scoped to the Playwright BrowserContext so mocked specs
  cannot leak to true-E2E specs running concurrently.
- **FR-006**: True-E2E spec count MUST drop to ≤ 12 spec files
  (down from 33) after migration, covering only critical
  end-to-end user journeys.
- **FR-007**: A migration playbook in `research.md` MUST map every
  one of the 33 existing E2E spec files to its target layer (or
  mark "split into N files at layers X+Y+Z" where applicable).
- **FR-008**: After migration, every assertion that today passes in
  the E2E suite MUST continue to pass at whichever layer it landed
  in (zero coverage loss).
- **FR-008a**: "Migration complete" is defined as: **all 33
  currently-E2E spec files have been categorised and either moved
  to their target layer OR explicitly kept in true-E2E with a
  1-line rationale comment in the file**. SC-004 (wall-time ≤ 17
  min) is the *validation gate* that proves the categorisation
  was worthwhile, NOT the stop signal — if categorisation finishes
  but wall-time misses, that triggers a follow-up perf spec
  (per-worker DB) rather than reopening 015.
- **FR-009**: The constitution MUST be amended to document the
  four-layer pyramid as the project standard, with a one-paragraph
  decision guide and a list of the layer-specific verification
  gates. The amendment lands BUNDLED with US1's component-layer
  infrastructure commit (not separately first, not last) so the
  new principle has working proof-of-concept code from day one.
- **FR-010**: The webserver lifecycle bug ("relation clubs does
  not exist" race) MUST no longer fire on a clean test DB. The
  fix is a new `db.setup.ts` Playwright project that owns schema
  migration; the `chromium` (true-E2E) project and the existing
  `auth.setup.ts` setup project declare it as a dependency, so
  Playwright runs `db.setup` BEFORE the webserver URL probe. The
  legacy `globalSetup` config option is removed (constitution V:
  the schema lifecycle becomes append-only project events instead
  of a one-shot global hook).
- **FR-011**: Test infrastructure for layers 2 and 3 MUST live
  under `tests/component/` and `tests/e2e-mock/` (or chosen names)
  with NO test-only branches added to production source
  (constitution Test/Prod Separation hard rule).
- **FR-012**: The new layer commands MUST be added to the seven
  verification gates (constitution v1.7) OR the gates MUST be
  restructured to express that all layers must pass before merge.

### Key Entities

- **Test Layer**: one of four — unit / component / api-mock-e2e /
  e2e. Each has a runner, a command, a directory under `tests/`,
  and a set of constraints (what it CAN and CANNOT assert).
- **Spec Categorisation Record** *(lives in research.md)*: for each
  of the 33 existing E2E spec files, the target layer (or per-test
  split decision) + a one-sentence rationale.
- **Layer Decision Rule** *(lives in the constitution)*: the
  one-paragraph guide that tells a future developer which layer to
  put a new test in based on what it asserts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The component test layer's wall time is ≤ 30 seconds
  for the migrated batch (currently 0s — layer doesn't exist).
- **SC-002**: The API-mocked E2E layer's wall time is ≤ 90 seconds
  for the migrated batch (currently 0s — layer doesn't exist).
- **SC-003**: The true-E2E layer's wall time is ≤ 12 minutes for
  the remaining ~10 critical-journey specs (current: unknown total
  but extrapolated ~25-30 minutes for the 33-spec suite).
- **SC-004**: The total `pnpm test` runtime (all four layers
  combined) is ≤ 17 minutes (current full E2E run trending toward
  30+ minutes when it doesn't hit the lifecycle race).
- **SC-005**: Zero test coverage regressions — every assertion in
  the original 33-spec E2E suite passes at its new layer
  (verifiable by a one-time audit + the suite running green).
- **SC-006**: The "relation clubs does not exist" startup race no
  longer fires on a fresh DB. A fresh-clone test (clone repo →
  `pnpm install` → `pnpm docker:up` → `pnpm test`) succeeds on the
  first attempt without manual intervention.
- **SC-007**: 100% of new specs authored AFTER this work defaults
  to a documented layer (sampled by reviewing the next 5 specs
  merged post-015).

## Assumptions

- **Spec 014 storageState work is kept, not reverted**. The
  authedTest fixture and the 16 in-flight migrations stay as the
  baseline for the slimmed true-E2E layer.
- **Component-layer runner choice** *(resolved 2026-05-25)*:
  hybrid — Vitest + RTL by default (jsdom, fast), Playwright CT
  for the ~5-10 visual tests that need real CSS. See FR-004 and
  the Clarifications session.
- **Constitution VII (Fresh Code Hygiene) applies**: adding new
  dependencies for the component-layer runner is allowed if needed,
  but counts against the dep-bloat threshold and goes through the
  amendment procedure if it bumps a major version of any pinned
  item.
- **No new production code changes**. This is pure test
  infrastructure + categorisation work. Production source under
  `lib/`, `app/`, `components/`, `drizzle/`, `messages/` is
  untouched.
- **The split is incremental**. Each user story is independently
  shippable: US1 alone delivers the new component-layer
  infrastructure even if no specs migrate yet; US3 / US4 add
  migration value once US1 / US2 land.
- **CI configuration is out of scope**. The same Playwright CI
  pipeline keeps running; the new layer commands are invoked by
  the existing `pnpm test` orchestrator.
- **The 11 "keep as true E2E" specs may change after per-file
  audit**. The list in the description is the starting heuristic;
  any spec found to be visual-only on inspection moves down a layer.

## Out of Scope (explicitly deferred)

- **Option B from the perf analysis** (per-worker DB + raise
  `workers` count). Defer until after the layer split — true-E2E
  count drops to ~10 specs, which likely makes Option B
  unnecessary.
- **Visual regression / screenshot diffing** — separate spec if
  desired later. The component layer ENABLES it but doesn't add
  it.
- **Adding new tests** — this spec is purely re-categorisation +
  layer infrastructure. New test coverage is feature-spec work.
- **CI-specific configuration changes** — assume the same
  Playwright CI as today; only the local-dev `pnpm test` shape
  changes.
- **Test parallelism within the true-E2E layer** — deferred until
  the layer is sized down to ~10 specs and we measure whether
  parallelism is still needed.
- **A new visual-design-token testing approach** (snapshotting CSS
  custom properties, etc.) — separate concern, not blocking
  pyramid split.

## References

Cited during planning; preserved here so the rationale survives
beyond chat:

- **Playwright official Best Practices** —
  https://playwright.dev/docs/best-practices — auth state reuse via
  storageState, fixture patterns.
- **Steve Kinney — "Playwright webServer Without Surprises"** —
  https://stevekinney.com/courses/self-testing-ai-agents/playwright-web-server-without-surprises
  — _"`webServer` is not your deploy system, not your seed system,
  and not a substitute for application health checks."_
- **Autonoma AI — "Unit vs Integration vs E2E Testing"** —
  https://getautonoma.com/blog/unit-vs-integration-vs-e2e-testing —
  testing pyramid ratios (70/20/10), pyramid maths.
- **Autonoma AI — "Integration vs E2E Testing Compared"** —
  https://getautonoma.com/blog/integration-vs-e2e-testing — mock at
  the right boundary, real-DB-for-integration-tests argument.
- **TestLeaf — "Playwright Component Testing Fixes the Test
  Pyramid"** —
  https://www.testleaf.com/blog/playwright-component-testing-fixtures-test-pyramid/
- **Microsoft Playwright issue #19571** —
  https://github.com/microsoft/playwright/issues/19571 —
  `globalSetup` vs `webServer` ordering, still open as of 2026.
