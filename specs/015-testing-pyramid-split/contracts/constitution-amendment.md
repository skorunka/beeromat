# Contract: Constitution Amendment — Principle VIII (Testing Pyramid)

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

The full draft text below lands in `.specify/memory/constitution.md`
as a new section, bumping the version from v1.7.0 to **v1.8.0**
(MINOR — adds a new principle without modifying existing ones).

---

## Required Sync Impact Report (at top of constitution.md)

```markdown
<!--
SYNC IMPACT REPORT
==================
Version change: 1.7.0 → 1.8.0
Bump rationale: MINOR. New principle added (Core Principle VIII —
Testing Pyramid). Spec 015 surfaced that the project's 100%-E2E
test stack collapsed under its own weight: cold webserver builds
dominated every run, a `globalSetup` vs `webServer` race condition
surfaced as flaky "relation X does not exist" timeouts, and the
per-test sign-in cost (partially addressed in spec 014) was a
symptom of the deeper architecture mismatch. This amendment
codifies the four-layer pyramid — Unit, Component, API-mocked
E2E, True E2E — as the project's testing architecture.

Modified principles:
  (none renamed or redefined)

Added sections:
  - "VIII. Testing Pyramid" in Core Principles, with:
      * Four-layer hierarchy (Unit / Component / Mocked-E2E /
        True-E2E) and the "lowest layer that can verify the
        behaviour" decision rule.
      * Layer responsibility table — what each can/cannot assert,
        what infrastructure each requires.
      * Updated Verification Gates list (7 → 8) with the new
        `pnpm test:component` gate at position 4.

Modified sections:
  - "Verification Gates" in Development Workflow & Quality Gates:
    bumped 7-gate list to 8 gates; added `pnpm test:component`
    as gate 4; renumbered downstream gates.

Removed sections:
  (none)

Templates requiring updates:
  - ⚠  .specify/templates/plan-template.md — Constitution Check
       reminder block: bump "v1.7.0" reference to "v1.8.0".
  - ⚠  .specify/templates/spec-template.md — no change needed.
  - ⚠  .specify/templates/tasks-template.md — no change needed
       (verifiable-tasks rule already accommodates per-layer gates).

Follow-up TODOs:
  (none — spec 015 task list handles the migration; spec 014's
  storageState work + spec 015's `db.setup.ts` project together
  satisfy the new Principle.)

No principle removed or fundamentally redefined → MINOR, not MAJOR.

----- Prior amendment history (for reference) -----
1.7.0 → 1.8.0 (2026-05-25, MINOR): Added Principle VIII — Testing
  Pyramid. Codifies the four-layer test architecture introduced
  by spec 015 and adds an 8th verification gate (`pnpm test:component`).
[ ... existing history below ... ]
-->
```

---

## Section text — VIII. Testing Pyramid

```markdown
### VIII. Testing Pyramid

Tests MUST be authored at the **lowest test layer that can verify
the behaviour they assert**. The project recognises four layers,
fastest first:

1. **Unit** — Vitest + PGlite. Pure business logic, server-action
   transactions, Zod schemas, query helpers. Sub-second per test.
   No webserver, no browser. Run: `pnpm test:unit`.

2. **Component** — Vitest + React Testing Library (jsdom) by
   default, OR Playwright Component Testing (real CSS) for tests
   that assert computed visual properties (colour, contrast, font,
   touch-target size). Components rendered in isolation; no
   webserver, no DB. Run: `pnpm test:component`.

3. **API-mocked E2E** — Playwright with `page.route()` intercepting
   Server Action endpoints. Webserver up, but no DB writes
   permitted. Form validation, error toasts, UI-feedback state
   machines. Auth state loaded from the shared `storageState`.
   Run: `pnpm test:e2e-mock` (or via the `pnpm test:e2e`
   orchestrator).

4. **True E2E** — Playwright + real Postgres + production
   webserver. RESERVED for critical user-journey verification
   (~10-12 spec files, not more). Uses spec-014's `authedTest`
   fixture for storage-state-reuse. Schema migration owned by a
   `db.setup` Playwright project (NOT `globalSetup` — see spec
   015 for the race-condition reasoning). Run: `pnpm test:e2e`.

**The decision rule.** Before adding a new test, ask: *what is the
lowest layer at which I can verify this?* — and put it there.

- "The submit button is 44px tall" → component (Playwright CT for
  real CSS).
- "The dispute banner renders the right copy" → component (RTL
  with a fixture).
- "Form X rejects empty input with message Y" → API-mocked E2E
  (intercept the action; assert the rendered error).
- "A member can log a beer → see it on their tab → undo it" →
  true E2E (this is a critical journey).

A test that COULD run at a lower layer but is authored at a higher
one is a layer violation. PR reviewers MUST push back.

**Verification.** Each layer has its own gate (see the updated
Verification Gates list, now 8 gates). The `pnpm test`
orchestrator runs all four layers in fastest-first order and
fails fast.

**Rationale.** Spec 014's E2E-perf attempt showed that 100%-E2E
suites collapse under their own weight — cold webserver builds
dominate, the `globalSetup` race surfaces as flaky "relation X
does not exist" timeouts, and per-test sign-in costs serialise
the whole run even with storageState reuse. Test pyramids exist
because each layer is fundamentally cheaper than the one above
(unit: ms; component: tens of ms; mocked-E2E: seconds; true-E2E:
tens of seconds + webserver boot tax). Ignoring the pyramid is
perf debt that compounds with every new test. Added v1.8.0 in
response to the spec-014 retrospective.
```

---

## Updated Verification Gates section (modify in-place)

Replace the existing 7-gate list (under "### Verification Gates")
with this 8-gate list:

```markdown
1. **`pnpm typecheck`** — `tsc --noEmit` returns zero errors.
2. **`pnpm lint`** — ESLint (with the project's flat config)
   returns zero errors.
3. **`pnpm test:unit`** — every Vitest unit and integration test
   currently in the suite passes. Tests that exercise the database
   layer use PGlite, not a live Neon connection.
4. **`pnpm test:component`** *(added v1.8.0)* — every component-
   layer test passes. The Vitest+RTL branch runs first
   (sub-second); the Playwright CT branch runs second for the
   visual subset. Components rendered in isolation; no DB writes,
   no webserver.
5. **`pnpm build`** — `next build` succeeds, including
   TypeScript's second pass and route metadata collection.
6. **`pnpm test:e2e`** — Playwright runs the mocked-E2E + true-E2E
   projects against the production-mode app (`pnpm build &&
   pnpm start`) on an isolated test port, connected to an
   **isolated test database** (created by the `db.setup`
   Playwright project; destroyed per run; never a shared dev or
   prod DB), with email delivered over SMTP to a local Mailpit
   container so no real mail is sent, with Cloudflare Turnstile's
   documented test site keys, and with the test DB seeded into
   the precise state each test scenario requires. Every
   Acceptance Scenario from the corresponding User Story in
   `spec.md` MUST have a matching Playwright assertion at the
   appropriate layer.
7. **`pnpm i18n:check`** — every user-facing string resolves
   through the `next-intl` catalog (no literal English in JSX/TSX
   outside `messages/`), and the `cs` and `en` catalogs have
   identical key sets.
8. **`pnpm forms:check`** — no form delegates input handling to
   the browser: the scan rejects a native date/time input
   (`type="date"|"time"|"datetime-local"`) and the native
   `required` / `pattern` validation attributes anywhere in
   `app/**` or `components/**`.
```

The eight gates are non-negotiable for non-trivial changes.

---

## Diff against current Verification Gates section

The current list (v1.7.0) has 7 gates. This amendment:

- INSERTS new gate 4 (`pnpm test:component`) between current gates 3 (`pnpm test:unit`) and 4 (`pnpm build`).
- RENUMBERS what was gates 4-7 → 5-8.
- MODIFIES gate 6 (formerly 5) to mention `db.setup` Playwright project instead of `globalSetup`.
- LEAVES gates 1, 2, 3, 7, 8 untouched aside from renumbering.
