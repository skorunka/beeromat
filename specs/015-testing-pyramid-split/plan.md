# Implementation Plan: Testing Pyramid Split (v1.15)

**Branch**: `015-testing-pyramid-split` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-testing-pyramid-split/spec.md`

## Summary

Split the test suite into four layers per the testing-pyramid pattern.
Spec 014's storageState reuse was a stopgap; this spec is the
architectural fix. After the `/speckit-clarify` pass the approach is
locked:

- **Unit** (existing): Vitest + PGlite — server actions, schemas,
  business logic. 89 tests today, keep growing.
- **Component (NEW)**: hybrid runner — **Vitest + React Testing
  Library** (jsdom) by default for behavioural/locale/empty-state
  tests; **Playwright Component Testing** for the ~5-10 visual
  tests that need real CSS (computed colour, contrast, font, touch
  targets). Two configs, one test directory.
- **API-mocked E2E (NEW)**: Playwright with `page.route()` to
  intercept Server Action endpoints. Shares the production
  webserver with true-E2E (one boot, per-context interceptors).
  ~10 specs (form-validation, error-toast, UI-feedback flows that
  don't need a DB write).
- **True E2E (slimmed)**: current Playwright pattern + real Postgres
  + storageState (014's `authedTest` fixture). Reserved for ~10-12
  critical user journeys. `globalSetup` deleted; a new
  `db.setup.ts` Playwright project owns schema migration as a
  proper project dependency (per [Microsoft Playwright #19571](https://github.com/microsoft/playwright/issues/19571)).

The constitution gets a new Principle VIII (Testing Pyramid) bundled
with US1's first commit. Migration target: all 33 currently-E2E
specs categorised + moved (or kept in true-E2E with a 1-line
rationale comment). Wall-time target (SC-004: `pnpm test` ≤ 17 min)
is the validation gate, not the stop signal.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), constitution v1.7.0 pin.

**Primary Dependencies** *(test stack — production code untouched)*:
- **Existing**: Vitest 4.1.x, `@playwright/test` 1.60.x, `jsdom` 29.x, `@testing-library/react` 16.x, `@testing-library/jest-dom` 6.x, `@vitejs/plugin-react` 6.x.
- **New**: `@playwright/experimental-ct-react` (latest, pairs with Playwright 1.60+); no other deps required — RTL is already installed (used by some unit specs today; this spec extends its scope to the new component layer).

**Storage**: per-layer:
- Unit: PGlite (in-memory Postgres)
- Component: none (jsdom for Vitest+RTL; isolated component renders for Playwright CT)
- Mocked-E2E: none for app data (Server Actions intercepted); auth via the shared storageState
- True-E2E: real Postgres (test DB via the existing `local-neon-http-proxy`)

**Testing**: Vitest for unit + component (RTL branch); Playwright CT for visual-subset component tests; Playwright (standard) for mocked-E2E + true-E2E.

**Target Platform**: same as project — Next.js 16 App Router web app on Vercel Edge (production); Docker Postgres + Mailpit locally.

**Project Type**: Next.js full-stack web app. No new top-level structure; new test dirs alongside existing `tests/`.

**Performance Goals** (from spec SCs):
- Component layer ≤ 30s wall time (SC-001)
- API-mocked E2E ≤ 90s (SC-002)
- True-E2E ≤ 12 min for the slimmed suite (SC-003)
- Total `pnpm test` ≤ 17 min (SC-004) — validation, not stop signal (per FR-008a)

**Constraints**:
- Constitution Test/Prod Separation: no new branches in production source for test concerns. Mocked-E2E intercepts at the Playwright network layer, NOT via app code branches.
- Constitution VII Fresh Code Hygiene: any new dep declared at latest stable; lockfile-sync gate enforced.
- Zero coverage loss (FR-008, SC-005): every existing assertion must pass at its new layer.

**Scale/Scope**: 33 currently-E2E spec files → categorised + moved. Target distribution post-split: ~6 component (RTL), ~3-5 visual (Playwright CT), ~10 mocked-E2E, ~10-12 true-E2E, ~remainder split per-scenario.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I — Mobile-First PWA | No product surface changes | ✅ N/A |
| II — Tenant-Aware Schema | No schema changes | ✅ N/A |
| III — Track, Don't Transact | No money APIs | ✅ N/A |
| IV — Auth & Bots | Mocked-E2E layer reuses 014's `authedTest` storageState; no new auth code path | ✅ |
| V — Auditable History | Component + mocked layers don't touch the DB; true-E2E uses existing 014 pattern | ✅ |
| VI — Free-Tier First | All new tooling runs locally / in existing CI; no new SaaS deps | ✅ |
| VII — Fresh Code Hygiene | Adding `@playwright/experimental-ct-react` (and RTL scope expansion). Both deps stay at latest stable, lockfile-sync verified | ✅ |

### Special rules (constitution v1.4+)

- **Verifiable Tasks**: every task in `/speckit-tasks` will be backed by either a layer gate (`pnpm test:component`, `pnpm test:e2e-mock`, `pnpm test:e2e`) or by an Acceptance Scenario.
- **Personas**: ✅ P1/P2/P3 (developer / CI runner / future-feature engineer) cited in spec.
- **Verification Infrastructure**: ✅ this spec IS the verification-infra work; no chicken-and-egg.
- **Test/Prod Code Separation**: **CRITICAL for this spec**. The mocked-E2E layer intercepts at the Playwright `page.route()` boundary, NOT via `if (process.env.MOCK)` branches in app code. The whole point is to keep production source pure.
- **User Input & Forms**: N/A (no new forms).
- **i18n**: N/A (no new user-facing strings — test code only).

### New principle being added in this spec

- **Principle VIII — Testing Pyramid** (text drafted in research.md R6). Lands bundled with US1's first commit (per the Q4 clarification). Adds the four-layer rule + the layer-decision guide. May add an 8th verification gate (`component:check` or restructure existing gates to cover all four layers).

**Result**: zero violations. Complexity Tracking table left empty. The 8th-gate question is a plan-phase decision (recorded in research.md R7).

## Project Structure

### Documentation (this feature)

```text
specs/015-testing-pyramid-split/
├── plan.md              # This file
├── spec.md              # Spec + 5 clarifications integrated
├── research.md          # Phase 0 output — 7 decisions
├── data-model.md        # Phase 1 — Test Layer entity, categorisation record
├── quickstart.md        # Phase 1 — manual verification walk-through
├── contracts/
│   ├── layer-commands.md         # pnpm script contracts (test:unit, test:component, ...)
│   └── constitution-amendment.md # Draft text of Principle VIII for the constitution
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (created by /speckit-tasks)
```

### Source Code (repository root)

Existing Next.js 16 App Router project. Changes:

```text
beeromat/
├── package.json                          # MODIFY: add @playwright/experimental-ct-react; add scripts (test:component, test:e2e-mock); rework test orchestration
├── pnpm-lock.yaml                        # UPDATE: lockfile-sync
├── vitest.config.ts                      # MODIFY: add a `component` project or split into vitest.unit.config.ts + vitest.component.config.ts
├── playwright.config.ts                  # MODIFY: scope testDir/testMatch to true-E2E specs only; add db.setup project; remove globalSetup
├── playwright-ct.config.ts               # NEW: Playwright CT config for visual subset (testDir: tests/component, testMatch: *.ct.spec.tsx)
├── playwright.mock.config.ts             # NEW: separate Playwright config for mocked-E2E layer (or one config with multiple projects — see research R4)
├── .specify/
│   └── memory/
│       └── constitution.md               # MODIFY: add Principle VIII (Testing Pyramid), bump to v1.8.0
├── tests/
│   ├── unit/                             # EXISTING — server actions, Zod schemas, business logic
│   ├── component/                        # NEW — Vitest+RTL component tests (*.spec.tsx) + Playwright CT visual tests (*.ct.spec.tsx)
│   │   ├── _setup.ts                     # NEW — RTL globalSetup (matcher extension, etc.)
│   │   └── *.spec.tsx                    # NEW — migrated visual / locale / empty-state tests
│   ├── e2e-mock/                         # NEW — Playwright + page.route() interceptors
│   │   ├── fixtures/                     # NEW — shared mock-response builders
│   │   └── *.spec.ts                     # NEW — form-validation, error-toast, UI-feedback specs
│   ├── e2e/                              # EXISTING — true-E2E, slimmed to ~10-12 specs
│   │   ├── db.setup.ts                   # NEW — Playwright project that owns schema migration (replaces globalSetup)
│   │   ├── auth.setup.ts                 # EXISTING (014) — depends on db.setup
│   │   ├── global-setup.ts               # DELETE — replaced by db.setup project
│   │   ├── global-teardown.ts            # MODIFY or KEEP — wipeTestDb may stay if useful for CI cleanup
│   │   ├── fixtures/                     # EXISTING — test.ts (authedTest), seed.ts, test-db.ts
│   │   └── *.spec.ts                     # SLIMMED — only true-E2E specs remain after migration
│   └── helpers/                          # EXISTING — db.ts (PGlite helper)
└── BACKLOG.md                            # UPDATE: mark the E2E-perf bulk migration item resolved by spec 015
```

**Structure Decision**: stay within the existing `tests/` tree —
new layers are sibling directories. No top-level rearrangement.
Per-layer config files at repo root so each runner has its own
entry point. Constitution amendment lives in
`.specify/memory/constitution.md` per the project's amendment
procedure.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

### Phase 1 re-evaluation (post-design)

After authoring `data-model.md` + `research.md` + `contracts/`,
re-running the gate table: all 7 existing principles still ✅,
new Principle VIII added cleanly (text in
`contracts/constitution-amendment.md`). The lifecycle change
(`db.setup.ts` replaces `globalSetup`) is a TEST-INFRA change with
zero production-code impact — Principle V (Auditable History) is
unaffected because schema migration is not a "historical event row".

No new violations. Complexity Tracking remains empty.
