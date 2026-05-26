<!-- SPECKIT START -->
Testing strategy (post spec 015 reversal — 2026-05-26):
Playwright E2E was removed and is being reintroduced one
journey at a time per Constitution Principle VIII (v1.9.0).
What we run today:

  - **Unit** — Vitest + PGlite (`pnpm test:unit`). Server actions,
    Zod schemas, business logic, transactions, queries.
  - **Component** — Vitest + React Testing Library, jsdom env
    (`pnpm test:component`). Renders components in isolation with
    mocked data; no webserver, no real DB. Add tests here for any
    new presentational behaviour.
  - **E2E (happy path only)** — Playwright (`pnpm test:e2e`).
    One spec so far (`tests/e2e/onboarding-happy-path.spec.ts`,
    spec 016 — fresh-install onboarding). Cold build + run in
    ~1 minute. Each future critical journey gets its own spec
    that brings its test along — no journey-less E2E gets added.
  - `pnpm test` = unit + component + i18n:check + forms:check.
    `pnpm test:e2e` is run separately because it requires Docker
    (postgres on :15432) and a cold next build.

Future crucial journeys still pending: log a beer, settle, treasurer
confirm, bet transfer, match agreement. Each goes through its own
spec dir with a Test layer declaration in its plan.md.

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
