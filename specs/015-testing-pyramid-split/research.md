# Research: Testing Pyramid Split (v1.15)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

The five `/speckit-clarify` decisions (runner, lifecycle, webserver
sharing, amendment timing, completion definition) covered the
biggest open questions. This document records the smaller
implementation-level decisions surfaced while writing the plan.

---

## R1 — Vitest config organisation (single vs split)

**Decision**: split into two Vitest config files — `vitest.unit.config.ts` and `vitest.component.config.ts` — each pointing at its own test directory and using its own environment. The npm scripts wire them up: `pnpm test:unit` runs the unit config, `pnpm test:component` runs the component config.

**Rationale**: unit tests use the `node` environment + PGlite + the existing `vi.mock('@/lib/db/client', ...)` pattern. Component tests use the `jsdom` environment + RTL's `cleanup()` + the project's CSS pipeline (Tailwind via PostCSS). Mixing environments in one config means a slow setup phase that loads both — splitting keeps each layer's startup time minimal.

**Alternatives considered**:

- *Single config with Vitest projects* — Vitest 4.x supports a `projects` array with per-project env. Workable but the global setup overhead for both projects fires on every `pnpm test:unit` even when only unit work is being tested. Verdict: rejected for speed.
- *One config, one env, fork at test level* — share `node` env, render React via `react-dom/server` for component tests. Cuts off the visual / event-handling tests that need a DOM. Rejected as too restrictive.

---

## R2 — Playwright Component Testing config separate from main Playwright config

**Decision**: separate `playwright-ct.config.ts` for the visual subset. The main `playwright.config.ts` stays focused on true-E2E + mocked-E2E (which share the production webserver). Playwright CT has its own server (Vite dev server under the hood) and a different test pattern.

**Rationale**: Playwright CT is fundamentally different — it does NOT use the project's Next.js webserver; it spins up a Vite-based component renderer with custom mount/unmount semantics. Trying to express that in the same config as true-E2E creates conflicting `webServer` blocks and confusing `testMatch` patterns. Per the Playwright CT docs, separate config is the recommended pattern.

**Alternatives considered**:

- *Single playwright.config.ts with multiple projects* — viable but the CT project requires its own webServer config (Vite dev) which Playwright treats as a top-level field, not per-project. Rejected.
- *Use Vitest's experimental `@vitest/browser` package instead of Playwright CT* — would unify under one runner. But `@vitest/browser` is newer (less mature ecosystem) and the team already uses Playwright extensively. Rejected for tooling familiarity.

---

## R3 — `db.setup.ts` Playwright project structure

**Decision**: new file at `tests/e2e/db.setup.ts`. It's a Playwright "test" (so it runs in the project graph) that:
1. Asserts loopback on `TEST_DATABASE_DIRECT_URL` (existing safety guard).
2. Calls `applyMigrations(directUrl)` from the existing `tests/e2e/fixtures/test-db.ts`.
3. Logs `[db.setup] schema migrated in NNNms`.

The `chromium` (true-E2E) project + `auth.setup.ts` setup project declare `dependencies: ['db.setup']`. The existing `globalSetup: './tests/e2e/global-setup.ts'` line is REMOVED from `playwright.config.ts`; `global-setup.ts` is deleted. `globalTeardown` may stay (it wipes the DB clean at the end of the run; useful for CI hygiene).

**Rationale**: matches the recommended pattern from [Microsoft Playwright #19571](https://github.com/microsoft/playwright/issues/19571) and aligns with how `auth.setup.ts` already works. Project dependencies are guaranteed to run before the dependent project's `webServer` URL probe.

**Alternatives considered**:

- *Make `auth.setup.ts` do both* (migrate THEN sign-in). Couples two responsibilities; if the DB migration fails, the auth setup error message blames the wrong thing. Rejected.
- *Keep `globalSetup`* but add a sleep/retry around the webserver URL probe. Hacky, doesn't solve the root cause. Rejected.

---

## R4 — Mocked-E2E config: same `playwright.config.ts` or separate

**Decision**: KEEP a SINGLE `playwright.config.ts` for both mocked-E2E and true-E2E layers. Two projects inside it: `chromium-mock` (testDir: `tests/e2e-mock`) and `chromium` (testDir: `tests/e2e`). Both depend on `db.setup` + `auth.setup`. Both share the webserver. Run separately via `pnpm test:e2e-mock` and `pnpm test:e2e` using Playwright's `--project` flag.

**Rationale**: per the Q3 clarification (shared webserver), splitting into two configs would force two webserver boots when you run "everything" — wasteful. One config + two projects = one boot + per-project filtering. `--project=chromium-mock` runs only the mocked-E2E specs; `--project=chromium` runs only true-E2E; `pnpm test:e2e-all` runs both (or just `pnpm playwright test` with no filter).

**Alternatives considered**:

- *Separate config per layer* — would duplicate the webserver block + db.setup dependency wiring. Rejected.
- *Inline mocked-E2E specs into the e2e/ dir with a tag filter* — couples the layers physically. Harder to reason about which DB writes a given spec performs. Rejected for clarity.

---

## R5 — `page.route()` interception pattern for Server Actions

**Decision**: a small helper `tests/e2e-mock/fixtures/mock-action.ts` exports `mockServerAction(page, actionName, response)`. Under the hood it calls `page.route()` with a glob matching Next.js's Server Action POST endpoints (`**/_next/*` with the right header) and returns the canned `response` (success-shape or error-shape). Specs call it in `beforeEach`.

**Rationale**: Next.js Server Actions are POST requests to the page itself (not a separate `/api` route) with an `Next-Action` header containing the action's hash id. Matching by URL alone matches every POST; we need to match by header. Encapsulating the matching logic in a helper avoids every spec rediscovering it.

**Alternatives considered**:

- *Mock at the React Server Component fetch boundary using `msw`*. Adds a new heavyweight dep; doesn't actually intercept the Server Action path Next.js uses. Rejected.
- *Just call `page.route('**/*')` and inspect the request inside each spec*. Repetitive; error-prone (every spec re-implements the same matching logic). Rejected.

The helper signature (rough sketch, not binding the implementation):

```ts
// tests/e2e-mock/fixtures/mock-action.ts
export async function mockServerAction(
  page: Page,
  options: {
    /** Match the Server Action by URL pattern OR by Next-Action header value. */
    actionId?: string;
    urlPattern?: string;
    /** Canned response — either an `{ ok, ... }` discriminated union from the action's return type, or a Response object for non-200 simulation. */
    response: object | Response;
  },
): Promise<void>;
```

---

## R6 — Constitution amendment text (Principle VIII)

**Decision**: append to `.specify/memory/constitution.md` a new section "VIII. Testing Pyramid", bump version to **v1.8.0** (MINOR — new principle), include a SYNC IMPACT REPORT at the top per the amendment procedure.

Draft text (final wording lives in `contracts/constitution-amendment.md`):

> ### VIII. Testing Pyramid
>
> Tests MUST be authored at the lowest test layer that can verify
> the behaviour. The project recognises four layers, fastest first:
>
> 1. **Unit** — Vitest + PGlite. Pure business logic, server-action
>    transactions, Zod schemas, query helpers. Sub-second per test.
> 2. **Component** — Vitest + RTL (jsdom default), OR Playwright
>    Component Testing for tests that need real CSS (computed
>    colour, contrast, font, touch-target size). Components
>    rendered in isolation; no webserver, no DB.
> 3. **API-mocked E2E** — Playwright with `page.route()` intercepting
>    Server Actions. Webserver up, but no DB writes. Form
>    validation, error toasts, UI-feedback state machines.
> 4. **True E2E** — Playwright + real Postgres + production
>    webserver. RESERVED for critical user-journey verification
>    (~10-12 specs, not more). Reuses the spec-014 `authedTest`
>    fixture.
>
> **The decision rule**: ask first whether the test could pass at
> a lower layer. If yes, that's where it goes. A test asserting
> "the submit button is 44px tall" is component-layer, NOT E2E.
> A test asserting "the dispute banner renders the right copy" is
> component-layer with a fixture, NOT E2E.
>
> **Verification**: each layer has its own `pnpm` command and a
> dedicated gate. The full `pnpm test` orchestrator runs all four
> in fastest-first order and fails fast.
>
> **Rationale**: spec 014's E2E-perf attempt showed that 100%-E2E
> suites collapse under their own weight — cold webserver builds
> dominate, the `globalSetup` race surfaces as flaky "relation X
> does not exist" timeouts, and per-test sign-in costs serialise
> the whole run. Test pyramids exist because each layer is
> fundamentally cheaper than the one above; ignoring the pyramid
> is a perf debt that compounds with every new test.

---

## R7 — Verification gate restructuring

**Decision**: extend the existing 7-gate list (constitution v1.7) to **8 gates**, adding `pnpm test:component`. The current `pnpm test:unit` stays as-is. The current `pnpm test:e2e` becomes shorthand for "run both `chromium-mock` and `chromium` projects" (the orchestrator); the underlying scripts are `pnpm test:e2e-mock` and `pnpm test:e2e-full` if explicit per-layer control is needed.

Updated gate list (Principle VIII text):

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test:unit`
4. **`pnpm test:component`** *(NEW — gate 4, shifting subsequent numbers)*
5. `pnpm build`
6. `pnpm test:e2e` (runs mocked + true-E2E projects)
7. `pnpm i18n:check`
8. `pnpm forms:check`

**Rationale**: a layer with no gate is a layer that decays. Without `pnpm test:component` as a non-negotiable gate, the migrated component tests slowly drift back to "skip these locally, CI is broken anyway" mode.

**Alternatives considered**:

- *Don't add a gate; rely on `pnpm test` orchestration*. Risk: developers run individual gates manually (the typical local-dev pattern); the component layer never gets exercised. Rejected.
- *Replace `pnpm test:e2e` gate with separate `pnpm test:e2e-mock` + `pnpm test:e2e-full`*. Cleaner per-layer accounting but adds another gate (9 total). Rejected as gate proliferation; the orchestrator inside `pnpm test:e2e` handles both project runs.

---

## R8 — Migration playbook: per-spec target layer

**Decision**: enumerate each of the 33 currently-E2E specs with its target layer + a one-sentence rationale. Lives here in research.md so `/speckit-tasks` can convert each line into a task.

| Current spec | Target layer | Rationale |
|---|---|---|
| `auth.spec.ts` | True-E2E | Tests the magic-link sign-in flow end-to-end; nothing meaningful to mock. |
| `forms-auth.spec.ts` | Mocked-E2E | Form-validation messages on /sign-in. No DB write asserted. |
| `onboarding.spec.ts` | True-E2E | Fresh-DB bootstrap → real Postgres state needed. |
| `us5-invite-onboard.spec.ts` | True-E2E | Invitation lifecycle with real member rows. |
| `ux-forgot-pin.spec.ts` | Mocked-E2E | Forgot-PIN form flow; mocks the magic-link request. |
| `email-i18n.spec.ts` | True-E2E (slim) | Asserts real email content via Mailpit — needs the real send path. |
| `admin-config.spec.ts` | Split: bootstrap → True-E2E, RBAC redirect → Mocked-E2E |
| `account.spec.ts` | Split: display-name edit (DB) → True-E2E, stub-row rendering → Component (RTL) |
| `buy-price.spec.ts` | Split: add-beer-with-price → True-E2E, US3 member-view → Component (RTL) |
| `forms-admin.spec.ts` | Mocked-E2E | All 4 scenarios test in-app validation messages. |
| `forms-money.spec.ts` | Mocked-E2E | Money-input validation; no DB write to assert. |
| `us1-log-beer.spec.ts` | True-E2E | Headline journey (log → tab → undo). |
| `us2-settle.spec.ts` | True-E2E | Headline journey (settle balance via QR). |
| `us3-treasurer-confirm.spec.ts` | True-E2E | Treasurer confirm/dispute pipeline. |
| `us4-treasurer-manual.spec.ts` | True-E2E | Treasurer manual payment recording. |
| `us6-bet-transfer.spec.ts` | True-E2E | Bet-transfer ledger state. |
| `us7-stock.spec.ts` | True-E2E | Stock changes are ledger events. |
| `us8-history.spec.ts` | True-E2E | Cross-session history requires real session rows. |
| `match-agreement.spec.ts` | True-E2E | Spec-013 doubles flow — bet-transfer pipeline. |
| `db-lifecycle.spec.ts` | True-E2E | Tests the DB lifecycle itself. |
| `seed-builders.spec.ts` | True-E2E | Tests the seed builder helpers against a real DB. |
| `smoke.spec.ts` | True-E2E (or DROP) | Basic smoke check — re-evaluate whether worth keeping after migration. |
| `ux-bet-no-session.spec.ts` | Component (RTL) | Empty-state copy assertion. |
| `ux-confirm-undo.spec.ts` | Split: undo round-trip (DB) → True-E2E, no-undo-when-empty (UI state) → Mocked-E2E |
| `ux-i18n.spec.ts` | Component (RTL) | Catalog rendering in EN + CS. |
| `ux-loading.spec.ts` | Component (RTL or CT) | `animate-pulse` skeleton presence — CT if real CSS needed. |
| `ux-navigation.spec.ts` | Split: nav-links-by-role → Mocked-E2E (mock role), admin hub list → Mocked-E2E |
| `ux-pending-row.spec.ts` | Component (CT) | Pending-row layout + touch-target separation — needs real CSS. |
| `ux-touch-targets.spec.ts` | Component (CT) | Button sizes — needs real CSS. |
| `ux2-guidance.spec.ts` | Component (RTL) | Empty-state copy + dispute banner copy. |
| `ux2-home-balance.spec.ts` | True-E2E | Asserts balance updates via real log + undo flow. |
| `ux2-payment-history.spec.ts` | Split: list rendering → Component (RTL), DB isolation (scenario 5) → True-E2E |
| `ux2-polish.spec.ts` | Split: money-format helper text → Component (RTL), bet-tally → True-E2E |
| `ux2-sign-out.spec.ts` | Mocked-E2E | Sign-out button + redirect; mock the sign-out action. |
| `ux2-stock-friendlier.spec.ts` | Mocked-E2E | UI patterns + form validation; no DB-write assertions. |
| `ux3-redesign.spec.ts` | Split: US1+US2+US4 visual → Component (CT), US3 layout → Component (CT), US5 admin surface → Component (CT) |

**Projected counts** after migration:
- Component (RTL): ~8 specs (~12 scenarios)
- Component (CT, visual): ~5 specs (~10 scenarios)
- Mocked-E2E: ~10 specs (~15 scenarios)
- True-E2E: ~12 specs (~25 scenarios; the journey heavies + the ones explicitly kept)

Total: 35-40 spec files post-migration (some splits → +files, some merges → -files). Stays in the same ballpark as today's 33 but with proper layer distribution.

---

## Open items deferred to `/speckit-tasks`

- Exact constitution version bump (1.8.0 or 1.7.1) — depends on whether the 8th-gate addition is "new section" (MINOR) or "clarification" (PATCH). Lean MINOR → 1.8.0.
- Whether to also restructure the 7 existing gates' ordering in the constitution text or leave numbering as-is. Plan-phase preference: leave numbering, add gate 4 as `pnpm test:component`.
- Whether `pnpm test` orchestrator should be a JavaScript script (one process spawning all four) or a shell-style `&&` chain in package.json. Lean `&&` chain — simpler, fails-fast by default.
