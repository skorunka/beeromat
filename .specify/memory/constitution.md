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
codifies the four-layer pyramid — Unit, Component, API-mocked E2E,
True E2E — as the project's testing architecture and adds an 8th
verification gate (`pnpm test:component`).

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
    bumped 7-gate list to 8 gates; added `pnpm test:component` as
    gate 4; renumbered downstream gates; gate 6 (was 5) updated to
    mention the `db.setup` Playwright project instead of the
    legacy `globalSetup` option.

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

Prior amendment 1.6.0 → 1.7.0 (2026-05-22, MINOR): Added Principle
VII — Fresh Code Hygiene. The v1.6 polish session surfaced that
installed TypeScript had drifted from 5.9 to the constitution's
pinned 6.0.x without anyone noticing for two minor cycles, plus 16
other dependencies had fallen behind `latest` on npm. Codified
"deps current as a default" as a non-negotiable principle.

----- Prior amendment history (for reference) -----
1.5.0 → 1.6.0 (2026-05-22, MINOR): Added the seventh verification
  gate, `pnpm forms:check`, making the "User Input & Forms" standard
  enforced rather than only reviewed; the standard's Status line was
  marked implemented with pinned `react-hook-form` 7.76.0 and
  `@hookform/resolvers` 5.4.0 over `zod` 4.x.
1.4.0 → 1.5.0 (2026-05-21, MINOR): Added the "User Input & Forms"
  standard — no native validation UI or native date/time pickers;
  form validation through a form library with a shared Zod schema and
  in-app error rendering; date/time entry via a locale-aware picker.
1.3.0 → 1.4.0 (2026-05-21, MINOR): Encoded the six UX-review framework
  lessons — sixth `i18n:check` gate, Principle V UI-reversibility
  clause, Verifiable Tasks / mandatory personas / verification-infra
  workflow rules, SMTP email stack row.
1.2.0 → 1.3.0 (2026-05-19, MINOR): Added "Test/Prod Code Separation"
  hard rule (zero test-only branches in production source) and
  per-project non-default container port hygiene.
1.1.1 → 1.2.0 (2026-05-19, MINOR): Added Verification Gates
  (five-gate definition of "done" including Playwright E2E) and
  softened PR language to trunk-based-direct-to-main reality.
1.1.0 → 1.1.1 (2026-05-19, PATCH): Added "Configuration administration"
  paragraph to Principle II clarifying that tenant-scoped config is
  admin-UI-driven, not env-var-driven.
1.0.0 → 1.1.0 (2026-05-19, MINOR): Multi-tenant softened to schema-only
  + single-club UX; auditable history relaxed from event sourcing to
  soft-delete + actor; PWA scope narrowed to installable manifest;
  tech stack pinned with web-verified May 2026 versions; auth library
  swapped from Auth.js v5 to Better Auth.
(none) → 1.0.0 (2026-05-19): Initial ratification.
-->

# beeromat Constitution

beeromat is a mobile-first web app that lets a small club (originally a
tennis club after-match crowd) track beer consumption, inter-member bet
transfers, stock, and balances owed to the club treasurer — without ever
processing money itself.

## Core Principles

### I. Mobile-First PWA

The primary surface MUST be a Progressive Web App optimised for one-thumb
operation on a phone in a noisy clubhouse. Desktop browser support is
permitted and expected for operational roles (treasurer reconciliation,
stock management), but no feature for daily members MAY require desktop.
Native iOS/Android packaging is out of scope; app-store distribution
introduces overhead disproportionate to a club-scale product.

For v1, "PWA" means **installable via a Web App Manifest** (home-screen
icon, standalone display) — but NOT a service worker. Offline support
and background sync are deferred to a later version once real usage shows
they are needed; the constitution will be amended at that time.

**Rationale:** Members open the app at the bar with one hand holding a
glass. Anything that needs two hands, a keyboard, or an app-store install
fails the "after match, after one beer" usability bar. Shipping without a
service worker removes a meaningful chunk of v1 complexity (cache
invalidation, sync queues) while still giving the install-to-home-screen
experience users actually ask for.

### II. Tenant-Aware Schema, Single-Club UX (v1)

`Club` is a first-class domain entity in the database from day one. Every
persisted row representing members, beers, stock, sessions, consumptions,
bets, payments, invitations, or configuration MUST carry a `club_id`
foreign key. No global state MAY leak across clubs at the data layer.

However, v1 ships **only single-club UX**: one club is seeded at deploy
time, there is no club-switcher, no public club onboarding, and no
cross-club admin surface. Multi-club onboarding/operations are explicitly
deferred to a later version.

**Rationale:** The user intends to offer beeromat to other clubs
eventually. `club_id` on day one is cheap; retrofitting it to a working
app means touching every query, every API route, every page, and the
auth/session shape — the canonical refactor disaster. By contrast, the
*user-facing* multi-club features add complexity that gives v1 users zero
value. Schema-yes, UI-no is the cheapest correct hedge.

**Configuration administration:** All club-scoped configuration —
including but not limited to currency, locale default, banking profile
(IBAN, Revolut handle), low-stock thresholds, beer types, member roles,
and any future per-club settings — MUST live in the database and be
administered via the in-app admin UI by users with the `club_admin`
role. Environment variables and static configuration files MUST be
reserved for deployment-scoped concerns (database URLs, third-party
API keys, secrets) and MUST NOT carry tenant-scoped settings. Adding a
club, changing a currency, or updating an IBAN MUST be an in-app
operation, never a redeploy.

### III. Track, Don't Transact

beeromat MUST NOT initiate, process, or hold money. It computes balances
from logged consumption and bet transfers, displays what each member owes
the treasurer, and exposes a "mark paid" action that records a payment
event. Real money movement happens out-of-band (bank transfer, cash). Any
future payment-rail integration is a v2+ concern requiring a constitution
amendment.

**Rationale:** Payment processing introduces PCI/PSD2 scope, banking
partners, and chargeback exposure incompatible with a free-tier club
tool. The original problem ("we forget who owes what") is solved by
accurate tracking alone.

### IV. Auth That Disappears, Bots That Bounce

Authentication MUST satisfy all of the following:

- **Invitation-only.** No public sign-up flow. New members are invited by
  a `club_admin` or `treasurer` using an email address.
- **Email magic-link is the root of trust.** First sign-in and any new
  device require a magic link sent to the invited email; passwords are not
  used.
- **Device-scoped PIN for daily use.** After magic-link sign-in, the user
  sets a 4-digit PIN that unlocks the app on that device. PINs are stored
  hashed (argon2id or equivalent) and scoped per-device; losing the PIN
  forces a fresh magic link.
- **Brute-force resistance.** Five wrong PIN attempts on a device MUST
  lock that device's session and require magic-link re-auth.
- **Bot resistance.** Cloudflare Turnstile MUST gate the email-entry form,
  and magic-link sends MUST be rate-limited per email and per IP.

**Rationale:** Club members will not tolerate password resets or 2FA
prompts to log a beer. Bots will find any public auth surface within
hours of deployment. The combination above gives near-zero-friction daily
use to invited humans while making automated abuse uneconomic.

### V. Auditable History (No Hard Deletes)

Domain rows representing consumption events, bet transfers, restocks,
stock adjustments, payments, and payment confirmations MUST be
append-only from the user's perspective. Specifically:

- Every such row MUST record `created_at`, `created_by_user_id`,
  `club_id`, and (where applicable) `session_id`.
- Corrections happen by writing a compensating row (e.g., a negative
  consumption or a `voided_at` / `voided_by_user_id` / `void_reason`
  marker), never by `UPDATE`/`DELETE` of historical rows.
- Member balances and stock levels MAY be stored as cached aggregates
  for query performance, but MUST be reconstructible from the underlying
  rows.
- **Reversibility is a UI property, not only a data property.** Where a
  compensating row exists to undo an action, the screen that performed
  that action MUST expose the undo. An auditable data model behind a
  one-way-door interface still strands the user. (Added v1.4.0 — the v1
  UX review found `voidConfirmedPayment` fully implemented in the action
  layer but reachable from no screen.)

**Rationale:** The original pain ("someone sent too much money, we can't
reconstruct why") is fundamentally an audit-trail problem. Mutable rows
let bugs and human errors silently rewrite history. A soft-delete +
compensating-row discipline gives the auditability we need without the
complexity of full event sourcing.

### VI. Free-Tier First, Scale on Demand

v1 MUST run end-to-end on the free tiers of Vercel (hosting), Neon
(Postgres), Resend (transactional email), and Cloudflare (Turnstile +
DNS). Any architectural choice that requires paid infrastructure for a
single 20-member club MUST be justified in the plan's Complexity Tracking
table with a concrete alternative considered and rejected. Scaling beyond
the free tier is a deliberate decision tied to actual multi-club
adoption, not a default.

**Rationale:** Operational cost should be zero until adoption proves
otherwise. The named free tiers comfortably support dozens of clubs at
the expected usage profile.

### VII. Fresh Code Hygiene

Dependencies stay current as a default, not as a periodic chore. The
project's installed lockfile MUST match the **Tech Stack & Constraints**
version table below — when they drift, the table is the source of
truth and the lockfile is updated to it.

- **Minor and patch bumps** MAY land continuously with no ceremony
  beyond the seven verification gates. A `chore(deps): bump X Y.Z →
  Y.Z+1` commit + passing gates is the whole flow.
- **Major bumps** of any item in the Tech Stack table MUST go through
  a constitution amendment (same procedure used to add this principle)
  AND pass all seven verification gates. The amendment justifies the
  bump in terms of stability / security / feature gains and revises
  the table in the same commit.
- **New outdated minor/patch versions** appearing in `pnpm outdated`
  SHOULD be addressed within one feature cycle — resolved before the
  next merge to `main`, or carried as an explicit task in the next
  spec's `tasks.md` with a deadline.
- Every release commit on `main` MUST leave the installed lockfile in
  sync with the Tech Stack table. A divergence at merge time is a
  release blocker, treated the same as a failing verification gate.

**Rationale:** Drift between installed deps and the pinned versions
is the same kind of debt that surfaces as confusing bugs months
later — a Next.js 16 minor that fixed a hot-reload race, a Drizzle
patch that fixed a connection-pool leak, a Base UI 1.5.0 that fixed
a pointer-capture race in DropdownMenu. The cost of bumping
continuously is the test-suite minute it takes to verify; the cost
of NOT bumping accumulates silently and lands as a multi-day "why
is staging broken" investigation. Trunk-based + good gates make
continuous bumping cheap; the discipline is just deciding to do it.

Added v1.7.0 from the v1.6 polish session — installed TypeScript had
drifted from 5.9 to the constitution's pinned 6.0.x without anyone
noticing for two minor cycles, the kind of silent divergence this
principle prevents.

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
   webserver, no DB. Run: `pnpm test:component` (RTL branch) +
   `pnpm test:component:visual` (Playwright CT branch).

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
   `db.setup` Playwright project (NOT `globalSetup` — the
   `globalSetup` ordering racing the `webServer` URL probe was
   what surfaced this whole pyramid rework; see Microsoft
   Playwright issue #19571). Run: `pnpm test:e2e` (orchestrator)
   or `pnpm test:e2e-full` (true-E2E project only).

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
perf debt that compounds with every new test.

Added v1.8.0 from the spec-014 retrospective. Spec 015 owns the
migration from 100%-E2E to the four-layer split.

## Tech Stack & Constraints

The following stack is normative for v1. All versions were verified
against upstream release channels in May 2026. Deviations require a
constitution amendment.

| Concern | Choice | Version | Stability note |
|---|---|---|---|
| Language | TypeScript (strict) | **6.0.x** | TS 7.x is beta (Go-native rewrite); not yet stable. |
| Runtime | Node.js | **24 LTS** | Active LTS. Node 26 becomes LTS in Oct 2026; revisit then. |
| Framework | Next.js (App Router) | **16.x** | v16 is current; v15 reaches end-of-support Oct 2026. |
| UI library | React | **19.2.x** | Required by Next.js 16. |
| ORM | Drizzle ORM | **0.45.x** (stable) | Drizzle v1.0 is still beta (beta.22 in Apr 2026); the 0.45.x line is the production line. |
| Migration tool | Drizzle Kit | **0.31.x** | Pairs with Drizzle ORM 0.45.x. |
| DB driver | `@neondatabase/serverless` | **^1.0** | GA; Neon's official driver, fits serverless functions on Vercel. |
| Database | Neon Postgres | (managed) | Free tier: 0.5 GB, branching included. |
| Auth | **Better Auth** | latest stable v1.x | Replaces Auth.js v5. Auth.js maintainers themselves direct new 2026 projects to Better Auth. Supports magic-link + custom PIN flow we need. |
| Transactional email | SMTP via `nodemailer`; Resend as the production SMTP provider; Mailpit container locally | `nodemailer` latest | One code path, env-driven (`SMTP_URL`). Resend's SMTP gateway in prod; Mailpit catches dev/test mail. Changed v1.4.0 from the Resend SDK so local/test email never leaves the machine. |
| Bot mitigation | Cloudflare Turnstile | (managed) + `@marsidev/react-turnstile` | Free, privacy-friendly, no clicking-buses UX. |
| Styling | Tailwind CSS | **4.3.x** | v4 line has been stable since Jan 2025. |
| Components | shadcn/ui CLI | latest | `new-york` style, `sonner` for toasts (older `toast` deprecated). |
| Hosting | Vercel | (managed) | Free Hobby tier for v1. |
| Observability | Vercel Analytics + structured `console` logs | (managed) | Free tier; revisit if we need traces. |

Linting/formatting MUST use the framework defaults (ESLint flat config,
Prettier). All code MUST pass `tsc --noEmit` and the linter before merge.

Major version upgrades of the items in this table MUST be proposed via a
constitution amendment so the stack stays coherent.

**Local development infrastructure.** All non-production dependencies
(database, transactional email, Redis, etc.) MUST be runnable locally
via `docker compose up` from the repo root. The default backing in
dev + test is a local container; cloud services are used only in
production deployments. Host port mappings MUST be non-default
(e.g., `15432:5432` for Postgres, `14444:4444` for the Neon HTTP
proxy) — multiple beeromat-style projects can run on the same dev
machine and using image-default ports causes silent collisions that
present as confusing "works for me / doesn't work for them" bug
reports. The repo's `docker-compose.yml` is the source of truth for
the host-port choices.

## Internationalization & Localization

- **Currency** MUST be a per-`Club` configuration value (ISO 4217 code);
  CZK is the deployment default but never hardcoded outside seed data.
- **Locale** MUST be a per-user preference defaulting to the club's
  default; v1 ships `cs-CZ` and `en` translation catalogs.
- All user-facing strings MUST flow through an i18n catalog. No literal
  user-facing English in JSX/TSX outside the catalog.
- Date, time, and number formatting MUST use `Intl.*` APIs with the
  user's locale.

## User Input & Forms

The app MUST NOT delegate input handling to the browser's defaults.

- **Validation.** Form validation MUST run through a form library
  (the chosen standard is `react-hook-form` with a Zod resolver,
  reusing the same Zod schemas the Server Actions already validate
  with), and validation errors MUST be rendered in-app with catalog
  strings. The HTML `required` attribute and other native constraints
  MUST NOT be the user-facing validation mechanism — the browser's
  default validation bubbles are unstyled, locale-ignoring, and
  inconsistent across browsers. Server-side Zod validation in the
  Server Action remains the authoritative boundary check; the client
  library is the UX layer over the same schema.
- **Date & time entry.** When a feature needs the user to pick a date
  or time, it MUST use a locale-aware picker component (the chosen
  standard is `react-day-picker`), never a native `<input type="date">`
  / `type="time">` / `type="datetime-local">`, which render
  inconsistently and ignore the application locale. Display-only dates
  continue to use `Intl.*` (see Internationalization).

**Rationale:** A clubhouse app on a range of phones must look and
behave the same for every member; native validation popups and native
date pickers vary by browser and OS and silently ignore the chosen
language. Routing both through app-controlled, locale-aware components
keeps the experience consistent and Czech-correct.

**Status:** Ratified in v1.5.0; **fully implemented in v1.2**
(`specs/003-forms-input-hardening/`, merged 2026-05-22). The pinned
libraries are `react-hook-form` 7.76.0 and `@hookform/resolvers` 5.4.0
over the existing `zod` 4.x. All 11 existing forms were migrated to
in-app, locale-aware validation; new forms comply from creation, and
the `forms:check` gate (see Verification Gates) fails the build on a
native date/time input or a native `required`/`pattern` constraint.
The locale-aware date-picker component itself remains deferred — no
screen collects a date yet; `react-day-picker` stays the standard for
the first feature that needs one.

## Development Workflow & Quality Gates

- Work flows through the spec-kit pipeline: `/speckit-constitution` →
  `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Skipping stages is permitted
  only for trivial changes (typos, copy edits, dependency bumps).
- Each feature lives on its own branch named per spec-kit conventions
  (`NNN-feature-name`) until merged. The project uses a **trunk-based**
  workflow with direct merges to `main`; pull-request review is not
  used at this team size. Commits follow Conventional Commits and MUST
  reference the relevant task ID(s) (e.g. `T054`) and / or user-story
  ID (e.g. `US1`) so traceability from spec → task → commit is
  preserved without a PR layer.
- A feature's `plan.md` MUST pass the Constitution Check gate before
  implementation begins. Any violation MUST be recorded in the
  Complexity Tracking table with a justification, not silently ignored.

### Spec & Task Discipline

These three rules were added in v1.4.0 from the v1 UX review. They
exist because work that is *only* a task — not also an acceptance
criterion or a gate — is structurally optional under deadline pressure
and silently drops.

- **Verifiable Tasks.** No task may exist in `tasks.md` unless its
  completion is observable by a verification gate or an acceptance
  test. If a task ("add translations", "add a11y labels") cannot be
  verified mechanically, either make it verifiable (add the gate) or
  fold it into an Acceptance Scenario. A task that cannot be checked
  is a hope, not a task.
- **Personas are a spec input.** Every `spec.md` MUST include a
  Personas section (3-5 realistic users spanning age, role, device,
  and tech comfort), and every Acceptance Scenario MUST name the
  persona it serves. A user story that only ever serves the power
  user is a flagged risk — the v1 review found the "occasional user"
  systematically under-served because no such persona was a spec
  input.
- **Verification infrastructure is Foundational.** The E2E rig, test
  database lifecycle, and seeding fixtures are a Phase-2 (Foundational)
  deliverable that blocks user-story work — not something discovered
  mid-stream. Built early, the rig pays compound interest: every
  later story is cheaper to verify and bugs surface sooner.

### Verification Gates

Every feature commit (and every commit that adds or changes
user-facing behaviour) MUST pass all of the following gates before
being pushed to `main`:

1. **`pnpm typecheck`** — `tsc --noEmit` returns zero errors.
2. **`pnpm lint`** — ESLint (with the project's flat config) returns
   zero errors.
3. **`pnpm test:unit`** — every Vitest unit and integration test
   currently in the suite passes. Tests that exercise the database
   layer use PGlite, not a live Neon connection.
4. **`pnpm test:component`** *(added v1.8.0)* — every component-layer
   test passes. The Vitest+RTL branch runs first (sub-second; jsdom);
   the Playwright CT branch runs second for the visual subset (real
   Chromium + real Tailwind). Components rendered in isolation; no DB
   writes, no production webserver. Powers Principle VIII.
5. **`pnpm build`** — `next build` succeeds, including TypeScript's
   second pass and route metadata collection. (For builds run without
   real secrets, `SKIP_ENV_VALIDATION=1` is the documented escape
   hatch.)
6. **`pnpm test:e2e`** — Playwright runs the mocked-E2E +
   true-E2E projects against the production-mode app (`pnpm build
   && pnpm start`) on an isolated test port, connected to an
   **isolated test database** (created by the `db.setup` Playwright
   project; destroyed per run; never a shared dev or prod DB —
   replaces the legacy `globalSetup` config option as of v1.8.0,
   which fixes the `globalSetup`-vs-`webServer` race), with email
   delivered over SMTP to a local Mailpit container so no real
   mail is sent, with Cloudflare Turnstile's documented test site
   keys, and with the test DB seeded into the precise state each
   test scenario requires. Every Acceptance Scenario from the
   corresponding User Story in `spec.md` MUST have a matching
   Playwright assertion at the appropriate layer. A scenario
   without a test is a spec without verification, not a feature
   without a problem.
7. **`pnpm i18n:check`** — every user-facing string resolves through
   the `next-intl` catalog (no literal English in JSX/TSX outside
   `messages/`), and the `cs` and `en` catalogs have identical key
   sets. Added v1.4.0: the v1 UI shipped entirely untranslated while
   gates 1-5 stayed green, because no gate could observe a hardcoded
   string. A gate that cannot be skipped beats a task line that can.
8. **`pnpm forms:check`** — no form delegates input handling to the
   browser: the scan rejects a native date/time input
   (`type="date"|"time"|"datetime-local"`) and the native `required`
   / `pattern` validation attributes anywhere in `app/**` or
   `components/**`. Added v1.6.0 with the v1.2 forms migration, it
   makes the "User Input & Forms" standard enforced rather than only
   reviewed.

The eight gates are non-negotiable for non-trivial changes. Skipping a
gate (e.g. shipping ahead of an E2E backfill) requires the same
justification discipline as a Constitution Check violation: noted in
the commit message as a `Skipped-Gate: <gate>` trailer with a
follow-up task referenced.

When building or modifying multi-piece infrastructure (the E2E rig,
deployment pipelines, CI workflows), each piece in the chain MUST be
verified working in isolation before the next piece is stacked on
top. Untested layers stacked together produce diagnoses-on-fire; a
verification per link is the only reliable path.

### Test/Prod Code Separation

**Hard rule:** Production source files (`lib/`, `app/`, `components/`,
`drizzle/`, `messages/`, and anything else that ships to prod) MUST
NOT contain branches that exist only to serve test scenarios.

Concretely banned in production source:

- `if (process.env.NODE_ENV === 'test') { ... }`
- `if (env.TEST_DB_DRIVER === 'pg') { useA() } else { useB() }`
- Test-only imports (`import { testStub } from '@/lib/test-only/...'`)
- Type unions whose only purpose is to satisfy test-mode return types
- Mock objects or fixtures exported from production modules

The test/prod difference MUST live in **configuration** — env vars
that set endpoints, secrets, or feature-flag values which the same
production code path consumes. Examples:

- Production reads `DATABASE_URL`; test sets it to a local Docker URL.
  Same code path, different connection target.
- Production reads `NEON_FETCH_ENDPOINT` (unset → driver default); test
  sets it to the local proxy URL. Same code path, same driver, just a
  different URL. The env var name does NOT contain the word "TEST" —
  anyone could legitimately set it in production to route through a
  private Neon mirror.
- Production reads `EMAIL_FROM`; test sets it to a no-op address. Same
  code path.
- Production reads `SMTP_URL` pointing at a real SMTP gateway (Resend);
  local dev and test point it at the Mailpit container. One
  `nodemailer` code path, one transport, just a different URL. This is
  the worked example to cite: the v1.4.0 email refactor moved off the
  Resend SDK precisely so the same code could target Mailpit without a
  test branch — config, not code.

Cleaner alternatives to test-branching, in order of preference:

1. **Config override** — same code, env-driven values. Use this 95%
   of the time. (e.g., `neonConfig.fetchEndpoint`).
2. **Local sidecar** — a Docker proxy that speaks the same protocol
   the production driver expects (e.g., `local-neon-http-proxy` for
   the Neon HTTP driver). Production driver stays unchanged.
3. **Test infrastructure outside prod source** — fixtures, mocks, and
   helpers live under `tests/`, never under `lib/`.
4. **Dependency injection at the boundary** — last resort. The prod
   entry point composes the dependency and passes it down; the test
   entry point composes a different one; but the inner business
   logic never knows it's being tested.

**Diff-against-prod-paths verification:** As part of every test
infrastructure change (Playwright setup, fixtures, etc.), examine the
diff for ANY changes under `lib/`, `app/`, `components/`, `drizzle/`,
or `messages/`. If something there was modified specifically for
tests, back it out and find the configuration path. **Verification
that "the test passes" is necessary but not sufficient** — the diff
must also show that no production code was contaminated.

This rule is **non-negotiable**. A test-only branch in production
source is a defect, not a tradeoff — back out and find the config
path no matter how much code has already been written on the wrong
path.

## Governance

This constitution supersedes all other practices in the beeromat project.
When a tension arises between this document and any other doc, this
document wins until amended.

**Amendment procedure:** Propose the change in a PR that edits this file,
includes a Sync Impact Report (as the HTML comment at the top), and
updates any dependent templates flagged in that report. Approval requires
a review acknowledging the version-bump rationale.

**Versioning policy** (semantic):

- **MAJOR**: Removing or fundamentally redefining a principle.
- **MINOR**: Adding a principle or materially expanding/revising
  guidance, including stack-level dependency swaps.
- **PATCH**: Clarifications, wording fixes, non-semantic refinements.

**Compliance review:** Every `/speckit-plan` invocation re-evaluates the
Constitution Check gate; principle violations must be justified or fixed,
not waived informally.

**Version**: 1.8.0 | **Ratified**: 2026-05-19 | **Last Amended**: 2026-05-25
