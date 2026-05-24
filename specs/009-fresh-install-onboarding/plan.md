# Implementation Plan: Fresh-Install Onboarding Wizard (v1.9)

**Branch**: `009-fresh-install-onboarding` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-fresh-install-onboarding/spec.md`

## Summary

A new `/setup` wizard turns the deploy-time precondition spec 008 left open into a browser flow. When the deployment is in true-fresh state (zero `clubs` rows AND zero `users` rows), the proxy (Next.js 16's renamed middleware at `proxy.ts`) redirects every non-asset request to `/<locale>/setup`. The wizard collects four fields (club name, currency, default locale, admin email), validates them with a Zod schema, then opens a single transaction that takes the same advisory lock spec 008 uses (`pg_advisory_xact_lock(1008)`), re-checks the fresh-state precondition, and inserts: one `clubs` row, one empty `club_banking_profiles` row, one `users` row with `emailVerified = false`. After commit, the action triggers Better Auth's `auth.api.signInMagicLink` so the email goes out through the same plumbing `requestMagicLinkAction` already uses. Clicking the magic link verifies normally and spec 008's existing `session.create.after` databaseHook auto-promotes the user to `club_admin` on the just-created club — state A→B with no change to the promotion path.

A module-level cached `isFreshDeployment()` signal keeps middleware overhead at zero once the cached `false` sticks; before bootstrap every request runs two cheap COUNT queries against tables with at most a handful of rows. Post-bootstrap `/setup` returns a 3xx on 100% of visits (anonymous → /sign-in, signed-in → /).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), Node.js 24 LTS — per constitution Tech Stack & Constraints table.

**Primary Dependencies**: Next.js 16.2.x (App Router + Turbopack dev + `proxy.ts`), React 19.2.x, next-intl 4.12 (locale routing + `getTranslations`), Better Auth 1.6 (magic-link plugin, `disableSignUp: true`), Drizzle ORM 0.45.x with `@neondatabase/serverless` ^1.1, react-hook-form 7.76 + `@hookform/resolvers` 5.4 + Zod 4.4 (User Input & Forms standard), shadcn/ui (`Form`, `FormField`, `FormControl`, `FormLabel`, `FormMessage`, `Input`, `Button`, `Select`, plus `BrandMark` from v1.5), lucide-react (icons), nodemailer + `@react-email/render` (the existing mailer; spec 007 i18n threading reused).

**Storage**: PostgreSQL (Neon serverless driver). Zero new tables, zero new columns, zero migrations. Reuses `clubs`, `club_banking_profiles`, `users` (Better Auth), `members` (the row inserted by spec 008's `promoteFirstUserIfNeeded`).

**Testing**: Vitest 4 unit tests against PGlite via `vi.mock('@/lib/db/client')` (matches `tests/unit/bootstrap-rule.spec.ts` pattern from spec 008); Playwright E2E against a production build + isolated test DB + Mailpit HTTP API (matches `tests/e2e/admin-config.spec.ts` pattern from spec 008).

**Target Platform**: Mobile-first PWA (constitution Principle I). Wizard runs on small viewports (Pavel opens the deployment URL on his phone immediately after `git push`). Desktop browsers supported but not the primary target.

**Project Type**: Web application (single Next.js 16 app — no separate frontend/backend split). Existing structure under `app/[locale]/` and `lib/`.

**Performance Goals**:
- Wizard render < 2s on mid-range mobile (FCP).
- Bootstrap-state detection in `proxy.ts`: post-bootstrap requests pay zero DB cost (cached `false`); during fresh state, the two `COUNT(*)` queries run on tables with 0 rows and complete in single-digit ms. End-to-end wizard submit (validate + transaction + email dispatch) < 800 ms.
- SC-001: full onboarding under 90 seconds end-to-end on mobile.

**Constraints**:
- `proxy.ts` MUST NOT break next-intl's locale routing or the existing `NEXT_LOCALE` cookie redirect — it composes around them, never replaces.
- The fresh-state precondition check MUST be transactional inside the bootstrap action (defence in depth — FR-012); the proxy redirect is a UX layer, not a security boundary.
- The bootstrap action's transaction MUST acquire the same `pg_advisory_xact_lock(1008)` key spec 008 uses, so the two bootstrap entry points (the wizard + the spec 008 pre-create in `requestMagicLinkAction`) serialise with each other.
- Magic-link email locale follows the wizard user's chosen `defaultLocale`, NOT their current UI locale — per Assumption in spec.md. Implementation: the action writes `NEXT_LOCALE` cookie to the chosen `defaultLocale` immediately before calling `auth.api.signInMagicLink`, so the existing `sendMagicLink` callback's `getLocale()` picks it up within the same request context.

**Scale/Scope**:
- v1 ships single-club. The wizard inserts exactly ONE clubs row; the precondition check is "zero clubs", not "this user has no clubs".
- Expected lifetime invocations per deployment: one. The wizard window closes the instant the first valid submit completes.
- Code surface: 1 new route group entry (`app/[locale]/setup/`), 1 new server action file, 1 new client form component, 1 new validation schema, 1 new cached-signal helper, ~25 new i18n keys, ~50 lines added to `proxy.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.7.0.

- **I. Mobile-First PWA** — ✅ Pass. Wizard is one-thumb friendly (single-column layout, no datetime pickers, native keyboard for the email field, native `<select>` only for the locale dropdown via shadcn `Select`). Standalone-display + Web App Manifest already inherited.
- **II. Tenant-Aware Schema, Single-Club UX (v1) + Configuration administration** — ✅ Pass / ✅ Reinforces. Spec 009 is the literal embodiment of Principle II's "Configuration administration" clause: it eliminates the last vestige of env-var-driven tenant config (the seed-time clubs row) and moves it to an in-app admin operation. Reinforces, doesn't violate.
- **III. Track, Don't Transact** — ✅ N/A. No money handling.
- **IV. Auth That Disappears, Bots That Bounce** — ⚠ Partial. The wizard's email-dispatch leg routes through `auth.api.signInMagicLink`, which already enforces the existing per-email + per-IP rate-limit (`checkMagicLinkLimits` in `lib/rate-limit.ts`) — so the rate-limit half of Principle IV is satisfied. **However**, Principle IV's text says "Cloudflare Turnstile MUST gate the email-entry form", and the wizard is an email-entry form. Spec 009's "Out of Scope" section explicitly defers Turnstile on the wizard with the justification that the wizard's window is bounded (closes on first successful submit). **Flagged in Complexity Tracking below.**
- **V. Auditable History (No Hard Deletes)** — ✅ Pass. The wizard's insert is the FIRST row in each table for this deployment — there is no history to preserve. Post-bootstrap edits happen via spec 008's existing `/admin/config` which itself satisfies V's reversibility clause (the form's diff is reviewable; changes go through validation).
- **VI. Free-Tier First, Scale on Demand** — ✅ Pass. No new infrastructure dependencies. Neon serverless driver, existing Mailpit + Resend SMTP path, no new external services.
- **VII. Fresh Code Hygiene** — ✅ Pass. No package version changes. The installed lockfile stays in sync with the Tech Stack table.

### Spec & Task Discipline (constitution Development Workflow section)

- **Verifiable Tasks**: every spec 009 task will be observable via a verification gate (`pnpm typecheck` / `lint` / `test:unit` / `build` / `test:e2e` / `i18n:check` / `forms:check`) or by a Playwright E2E acceptance assertion. The `/speckit-tasks` output will map each task to its verifier.
- **Personas are a spec input**: spec.md Personas section defines P5 Pavel as the primary, plus the P1 Standa / P3 Tereza invisibility canaries. Every Acceptance Scenario names its persona. ✅
- **Verification infrastructure is Foundational**: the E2E rig, PGlite + `vi.mock` pattern, and Mailpit HTTP API helpers already exist (spec 008 built them). No new infra required for spec 009.

### User Input & Forms (constitution standard, gate enforced by `forms:check`)

- Form uses react-hook-form + zodResolver + a shared Zod schema (`lib/validation/onboarding.ts`).
- Validation errors render in-app via shadcn `FormMessage` with catalog strings (`onboarding.*` namespace).
- No native validation: no `required`, no `pattern`, no `type="email"` reliance for validation, no `type="date"|"time"|"datetime-local"`. The email field uses `type="email"` purely as a mobile-keyboard hint — validation comes from the Zod schema.

### Internationalization & Localization

- All wizard-visible strings flow through `messages/cs.json` + `messages/en.json` under a new `onboarding.*` namespace. Catalog parity enforced by `pnpm i18n:check`.
- Locale dropdown in the wizard lists only the values exported by `routing.locales` — no hardcoded `cs`/`en` strings outside the catalog and the routing config.
- Currency code is collected as raw ISO 4217; no per-currency UI strings invented (currency labels in the wizard are just the codes — `CZK`, `EUR` — not localised names, which would require a separate ISO 4217 catalog out of scope here).

### Verification Gates (all seven must pass before push to `main`)

1. `pnpm typecheck` — covered: new files are strict TS.
2. `pnpm lint` — covered: ESLint flat config applies.
3. `pnpm test:unit` — covered: new Vitest specs for `isFreshDeployment` cache, `bootstrapClubAction` state-machine, validation schema edge cases.
4. `pnpm build` — covered: route under existing `[locale]` group, no new entry points.
5. `pnpm test:e2e` — covered: new `tests/e2e/onboarding.spec.ts` exercises US1/US2/US3/US4 happy paths plus invisibility.
6. `pnpm i18n:check` — covered: new `onboarding.*` keys land in both catalogs at the same time.
7. `pnpm forms:check` — covered: wizard form deliberately avoids native validation.

## Project Structure

### Documentation (this feature)

```text
specs/009-fresh-install-onboarding/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output — state machine extension to spec 008
├── quickstart.md        # Phase 1 output — manual + automated walkthrough
├── contracts/
│   └── onboarding.md    # Phase 1 output — bootstrapClubAction contract
├── checklists/
│   └── requirements.md  # /speckit-specify output (already exists, passing)
├── spec.md              # /speckit-specify output (already exists)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
app/
├── [locale]/
│   ├── (auth)/
│   │   └── sign-in/                          # existing — wizard's redirect target post-bootstrap (anonymous)
│   ├── (app)/                                # existing — wizard's redirect target post-bootstrap (signed-in)
│   ├── admin/config/                         # existing (spec 008) — wizard's post-bootstrap edit surface
│   └── setup/                                # NEW (spec 009)
│       ├── page.tsx                          # server component: renders SetupWizardForm
│       ├── SetupWizardForm.tsx               # client component: react-hook-form + zod
│       └── actions.ts                        # server actions: bootstrapClubAction
└── globals.css                               # existing

lib/
├── auth/
│   ├── actions.ts                            # existing — requestMagicLinkAction's bootstrap pre-create stays as the secondary entry
│   ├── better-auth.ts                        # existing — sessions.create.after hook fires promoteFirstUserIfNeeded (UNCHANGED)
│   ├── bootstrap.ts                          # existing — promoteFirstUserIfNeeded (UNCHANGED)
│   └── session.ts                            # existing
├── db/
│   ├── queries/
│   │   └── bootstrap-state.ts                # NEW: isFreshDeployment() with sticky module-level cache
│   └── client.ts                             # existing
├── email/
│   └── mailer.ts                             # existing (spec 007 — locale-aware) — UNCHANGED for spec 009
├── i18n/
│   └── routing.ts                            # existing — source of truth for locales list (wizard reads it)
└── validation/
    ├── admin-config.ts                       # existing (spec 008) — clubConfigSchema; spec 009 extends/composes for the wizard
    └── onboarding.ts                         # NEW: onboardingSchema (clubConfigSchema fields + adminEmail)

messages/
├── cs.json                                   # MODIFY: add onboarding.* namespace
└── en.json                                   # MODIFY: add onboarding.* namespace

proxy.ts                                      # MODIFY: chain isFreshDeployment() → redirect logic around next-intl middleware

scripts/
└── db-reset.ts                               # existing — bare `pnpm db:reset` becomes the canonical fresh-install test;
                                              # `pnpm db:reset:bootstrap` (insert one club) becomes legacy alias for testing the spec 008 path

tests/
├── unit/
│   ├── bootstrap-rule.spec.ts                # existing (spec 008) — UNCHANGED
│   ├── bootstrap-state.spec.ts               # NEW: isFreshDeployment cache transitions
│   ├── onboarding-action.spec.ts             # NEW: bootstrapClubAction happy + race + post-bootstrap-reject
│   └── onboarding-schema.spec.ts             # NEW: validation edge cases (name length, currency case, locale enum, email shape)
└── e2e/
    ├── admin-config.spec.ts                  # existing (spec 008) — UNCHANGED
    └── onboarding.spec.ts                    # NEW: US1 happy, US2 invisibility, US3 validation, US4 i18n parity
```

**Structure Decision**: Single Next.js 16 app, no new top-level directories. The wizard slots cleanly into the existing `app/[locale]/` route group so locale routing, font loading, root layout, and the next-intl provider all apply for free. The state-detection helper lives under `lib/db/queries/` alongside `club-config.ts` (its closest sibling — both read the `clubs` row, both are imported by both the proxy and the action layer). The validation schema lives under `lib/validation/` alongside `admin-config.ts`, which it composes (`clubConfigSchema + adminEmail`). Proxy modifications stay in the existing `proxy.ts` at the repo root rather than splitting into per-concern proxies (Next.js 16 supports exactly one).

## Complexity Tracking

> Constitution Check (Principle IV — Bot resistance) flagged the wizard's lack of Turnstile. This table records the justification per the constitution's "violations MUST be recorded in the Complexity Tracking table" rule.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Wizard's email-entry form is NOT gated by Cloudflare Turnstile (Principle IV says it MUST be) | The wizard window is one-shot per deployment: the instant the first valid submission lands, `/setup` returns 3xx on 100% of visits (SC-003). The abuse surface is bounded by the few-minute window between deploy and the operator's first visit. The existing per-email + per-IP rate-limit in `checkMagicLinkLimits` (which the wizard's email dispatch routes through via `auth.api.signInMagicLink`) covers the rate-limit half of Principle IV. | Adding Turnstile to the wizard is cheap (we already have the wiring on `/sign-in`) but optimises a surface that closes on its own within minutes of deployment. **If real-world deployment patterns show the window IS exploited** (e.g., shared staging environments that reset frequently), a follow-up spec adds Turnstile to the wizard with the same `@marsidev/react-turnstile` component already in use. v1.9 ships without it and revisits if needed. |
