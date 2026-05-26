<!-- SPECKIT START -->
Testing strategy (post spec 015 reversal — 2026-05-26):
Playwright E2E was removed. Iteration speed > simulated journey
coverage for a pet app whose E2E setup kept breaking. What we keep:

  - **Unit** — Vitest + PGlite (`pnpm test:unit`). Server actions,
    Zod schemas, business logic, transactions, queries. ~89 tests.
  - **Component** — Vitest + React Testing Library, jsdom env
    (`pnpm test:component`). Renders components in isolation with
    mocked data; no webserver, no real DB. Add tests here for any
    new presentational behaviour.
  - `pnpm test` = unit + component + i18n:check + forms:check.
    No build, no DB, no browser.

E2E for "crucial user journeys" (log a beer, settle, treasurer
confirm, bet transfer, match agreement, onboarding) will be added
back later as a deliberately small Playwright suite — NOT as the
default test ladder. Until then, don't introduce a `tests/e2e/`
directory.

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
