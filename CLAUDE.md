<!-- SPECKIT START -->
**In flight**: spec 020 — fun avatar picker. Spec + plan + research
+ data-model + contract + quickstart written; awaiting
`/speckit-tasks`. Plan: `specs/020-fun-avatar-picker/plan.md`.
Clarify decisions (2026-05-27): storage on `members.avatar_key`
per club seat (A), inline-SVG rendering via FlagIcon precedent
(B), picker lives in a new `/account` section (A).

Most recent shipped specs: 019 (log-for-other-member + /tab
origin-row expansion, all gates green, on origin/main), 018
(match-bet → home awareness MVP + follow-ups), 017 (home redesign
+ one-tap log), 016 (onboarding happy-path E2E). Each spec dir
under `specs/NNN-…/` carries its plan.md / data-model.md /
contracts/ as source of truth.

Live backlog (BACKLOG.md): inline polish items including pay-debt
button on /tab, money formatting without cents in the header,
language-picker refinement in the user-menu, fun avatar picker,
header brand → home link.

Testing strategy (Constitution v1.10.0 — four-layer pyramid,
clean separation, no glob bleed between layers):

  - **Unit** — Vitest, node env (`pnpm test:unit`). PURE FUNCTIONS
    ONLY: Zod schemas, authz predicates, format helpers, lint
    scripts. No DB, no filesystem, no network. Sub-second total.
    Location: `tests/unit/`. Config: `vitest.unit.config.ts`.
  - **Integration** — Vitest + PGlite (`pnpm test:integration`).
    DB-coupled code: Drizzle transactions, SQL queries, stateful
    DB rules. In-memory Postgres, no live Neon. Cold WASM warmup
    is ~10s on Windows (hookTimeout bumped to 30s).
    Location: `tests/integration/`. Config: `vitest.integration.config.ts`.
  - **Component** — Vitest + RTL + jsdom (`pnpm test:component`).
    Components in isolation with mocked data; server actions
    stubbed via `vi.mock()`. No webserver, no DB.
    Location: `tests/component/`. Config: `vitest.component.config.ts`.
  - **E2E (happy path only)** — Playwright (`pnpm test:e2e`).
    One spec so far (`tests/e2e/onboarding-happy-path.spec.ts`,
    spec 016). Each future critical journey gets its own spec
    that brings its test along; no journey-less E2E gets added.

`pnpm test` = unit + integration + component + i18n:check +
forms:check. `pnpm test:e2e` runs separately (needs Docker
postgres on :15432 and a cold `next build`).

When deciding where a new test belongs, default to the lowest
layer that can verify the behaviour. If you'd have to mock the
DB to keep a test in `tests/unit/`, it belongs in
`tests/integration/` instead. Don't mix layers in a shared
config or include glob.

Future crucial journeys still pending: log a beer, settle,
treasurer confirm, bet transfer, match agreement. Each goes
through its own spec dir with a Test layer declaration in its
plan.md.

Earlier shipped features live at `specs/001-beer-consumption-ledger/`
through `specs/013-matches-doubles-prematch/` — their `plan.md`,
`data-model.md`, and `contracts/` remain the source of truth for
the data model and server-action contracts. Spec 014 (E2E perf,
storageState reuse) and spec 015 (testing pyramid split) are
superseded by this reversal but their research and rationale stay
in the repo for context.

Constitution at `.specify/memory/constitution.md` — Principle VIII
(Testing Pyramid) is reinterpreted: layers 3 (API-mocked E2E) and
4 (true E2E) are deferred until a crucial-journey suite is spec'd.
<!-- SPECKIT END -->
