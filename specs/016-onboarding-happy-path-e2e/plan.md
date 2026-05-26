# Implementation Plan: Onboarding Happy-Path E2E

**Branch**: direct-to-`main`, trunk-based.
**Spec**: [spec.md](./spec.md) | **Constitution**: v1.9.0

## Summary

Bring Playwright back into the repo for a single happy-path E2E
covering the spec-009 onboarding wizard. Scope is deliberately tight:
one playwright.config.ts, one test file, one db-reset helper.
Anything bigger is a separate spec under Principle VIII.

## Technical Context

- **Test runner**: `@playwright/test` (latest 1.x, just-released).
- **Browser**: chromium only.
- **Webserver**: `next build && next start --port 3100`, env from
  `.env.test` (kept from before — already points at the test DB on
  port 15432).
- **DB**: real Postgres via docker-compose (`beeromat-postgres` on
  port 15432, direct connection — bypasses the Neon proxy because
  the test fixture needs to truncate + read verification rows
  directly, and 70 statements through the proxy is ~35s).
- **DB reset strategy**: before the one test, the helper truncates
  every domain table. Schema is assumed to exist (docker has been
  running migrations for weeks; the helper does NOT
  DROP+migrate). If the schema is missing the test fails loudly
  with a "relation X does not exist" — operator must
  `pnpm db:migrate` once. No `globalSetup`, no `db.setup`
  project — see Constitution VIII.

## Constitution Check

*GATE: Must pass before implementation.*

### Test layer declaration *(required by Principle VIII)*

- **Unit (`pnpm test:unit`)** — N/A for this spec. The bootstrap
  action's transaction (`createClubAndAdminUserTx`) already has unit
  coverage in `tests/unit/onboarding-action.spec.ts` (PGlite,
  shipped with spec 009). This spec adds the missing layer above
  that.
- **Component (`pnpm test:component`)** — N/A for this spec. The
  `SetupWizardForm` component is a thin form wrapper around the
  shared `<Form>` shadcn primitives; its rendering and field
  interactions are exercised by the E2E test below at no
  meaningful extra cost. A dedicated component test would test
  the wrapper itself, not the integration that matters here.
- **E2E (`pnpm test:e2e`)** — **REQUIRED**. The journey is
  exactly the spine that Principle VIII calls out as warranting
  a happy-path E2E: zero-state → wizard → submit → "link sent" →
  DB invariant. The journey crosses the form / server-action /
  Drizzle-transaction / Better-Auth-token seams, which are
  precisely the boundaries unit + component coverage cannot
  verify by construction.

### Other principle checks

- **Principle I (Mobile-First PWA)** — no UI changes, no impact.
- **Principle II (Tenant-Aware Schema)** — test asserts the
  `clubs` and `club_banking_profiles` rows are created; `club_id`
  invariants are unaffected.
- **Principle III (Track, Don't Transact)** — N/A.
- **Principle IV (Auth)** — test stops at "link sent". Magic-link
  click + verification are Better Auth's own well-tested code path
  and the spec-008 hook's PGlite-unit-tested code path; covered
  there, not here.
- **Principle V (Auditable History)** — N/A (no domain rows
  created in the test).
- **Principle VI (Free-Tier First)** — `@playwright/test` is a
  devDep; no production cost. The cold webserver build adds ~80s
  to local dev when the gate runs but no recurring spend.
- **Principle VII (Fresh Code Hygiene)** — install Playwright at
  its current latest 1.x (no pinning to a stale version).

## Build sequence

1. Install `@playwright/test` (devDep) + `pnpm exec playwright install chromium`.
2. Add `playwright.config.ts` at repo root (5-project chain from
   spec 015 is intentionally NOT recreated — single project,
   single worker, no `globalSetup`, no `db.setup`).
3. Add `tests/e2e/helpers/db.ts` (truncate + read-by-table
   helpers using `pg`, loopback-only assertion).
4. Add `tests/e2e/onboarding-happy-path.spec.ts` (the one test).
5. Add `pnpm test:e2e` script.
6. Update `.gitignore` to ignore `playwright-report/`,
   `test-results/`, `playwright/.cache/`.
7. Update `CLAUDE.md` so future sessions know E2E is back for
   this one journey.
8. Verify locally: `pnpm test:e2e` green.
9. Commit + push.

## Risk + mitigation

- **The cold-build webserver still takes ~80s.** Accepted for a
  single-journey gate; a single 80s build amortised over zero
  other tests is fine. If we ever add a second E2E spec, revisit.
- **The schema-already-exists assumption.** Documented in the
  test fixture's failure message + the spec. If a future
  contributor wipes the docker volume, the test surfaces a clear
  "run `pnpm db:migrate` first" diagnostic.
- **storageState contamination** (the 015 nightmare) is impossible
  here because there is exactly one test and no `authedTest`
  fixture. If a second test arrives, this risk reopens — handle
  it then.
