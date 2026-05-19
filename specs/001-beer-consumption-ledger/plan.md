# Implementation Plan: Beer Consumption Ledger (v1 MVP)

**Branch**: `001-beer-consumption-ledger` | **Date**: 2026-05-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-beer-consumption-ledger/spec.md`

## Summary

beeromat v1 is a mobile-first Progressive Web App that lets a ~20-member tennis club track per-session beer consumption, inter-member bet transfers, stock levels, and balances owed to the club treasurer. The app never moves money; it generates Czech QR Platba codes (and optional Revolut links) so members settle their tab via their own banking app, and treasurers confirm receipt with a single tap. Schema is multi-tenant (`club_id` on every row) but v1 UX is single-club. All club-scoped configuration lives in the admin UI, never in environment variables.

The technical approach: a single Next.js 16 App Router app on Vercel, backed by Neon Postgres via Drizzle ORM. Better Auth handles magic-link sign-in; a custom device-PIN service layers on top for daily unlock. Cloudflare Turnstile gates the magic-link request form. UI uses Tailwind 4.3 + shadcn/ui (new-york style). Internationalization via next-intl with `cs` and `en` catalogs. PWA installability via `app/manifest.ts`; service workers (offline) deferred to v2.

## Technical Context

**Language/Version**: TypeScript 6.0.x in strict mode

**Runtime**: Node.js 24 LTS (Active LTS as of May 2026)

**Framework**: Next.js 16.2.x with App Router, React 19.2.x, Server Components by default, Server Actions for mutations

**Primary Dependencies**:
- **Database**: PostgreSQL via Neon serverless driver `@neondatabase/serverless ^1.0`
- **ORM/migrations**: `drizzle-orm ^0.45` + `drizzle-kit ^0.31`
- **Auth**: `better-auth ^1.6` (magic-link plugin) + custom device-PIN service
- **PIN hashing**: `argon2 ^0.x` (argon2id, OWASP-recommended)
- **Email**: Resend SDK + `react-email` for templates
- **Bot mitigation**: Cloudflare Turnstile + `@marsidev/react-turnstile`
- **i18n**: `next-intl ^3.x` (locale-segment routing, server-component-native)
- **QR generation**: `qrcode ^1.x` (SVG output for crisp scaling)
- **UI**: Tailwind CSS 4.3.x + shadcn/ui CLI (new-york style, `sonner` toasts)

**Storage**: Neon Postgres (free tier, 0.5 GB, branching for preview DBs)

**Testing**:
- **Unit/integration**: Vitest + Testing Library; PGlite in-memory Postgres for DB-touching tests
- **E2E**: Playwright (Chromium + WebKit) — covers async Server Components, auth flow, settle flow, PWA install
- Async Server Components are NOT unit-testable in Vitest (current limitation); they are covered exclusively by Playwright

**Target Platform**:
- iOS Safari 16+ (PWA install support)
- Android Chrome 110+ (PWA install support)
- Desktop browsers for operational roles (treasurer dashboard, admin)

**Project Type**: Web application (single Next.js project — no separate backend; Server Actions + route handlers serve all server-side concerns)

**Performance Goals** (from spec Success Criteria):
- Open app → unlock → log a beer in **< 5 seconds** (SC-001)
- Member self-pay flow (open → QR generated → "I paid") in **< 60 seconds excluding bank-app time** (SC-003)
- Confirm a single payment: **exactly 1 tap** (SC-007a)
- Stock low-stock indicator visible within **< 5 seconds** of crossing threshold (SC-006)

**Constraints**:
- Mobile-first; daily-use flows MUST be one-thumb operable; touch targets ≥ 44×44 px
- Free-tier first (Vercel Hobby + Neon Free + Resend Free + Cloudflare Free)
- All tenant config admin-UI driven, never env vars (Constitution Principle II / FR-043)
- No money handling; only payment instruction rendering (Constitution Principle III)
- Append-only domain history; no hard deletes (Constitution Principle V)

**Scale/Scope**:
- v1: 1 club, ~20 active members, ~50 sessions/year, ~1000 consumptions/year
- Designed to support N clubs at the database layer; UI gates to 1 club for v1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan compliance | Notes |
|---|---|---|
| **I. Mobile-First PWA** | ✅ PASS | Next.js + `app/manifest.ts` (installable). No service worker in v1 (deferred per principle clarification). Touch targets ≥ 44×44 px enforced via Tailwind utility class baseline. |
| **II. Tenant-Aware Schema, Single-Club UX** | ✅ PASS | `club_id` is a NOT NULL FK on every domain table (members, beer_types, drink_sessions, consumptions, bet_transfers, stock_changes, payments, invitations). Single seeded club for v1. **Per the v1.1.1 amendment: all club-scoped config (currency, IBAN, locale default, thresholds) lives in DB tables administered via admin UI; env vars carry only deployment-scoped secrets (DATABASE_URL, RESEND_API_KEY, TURNSTILE_SECRET, BETTER_AUTH_SECRET).** |
| **III. Track, Don't Transact** | ✅ PASS | QR Platba SPAYD string generation + Revolut deep-link generation are NOT money processing — the user's banking app moves the money. beeromat only renders payment instructions and records `claimed`/`confirmed`/`disputed` state transitions. |
| **IV. Auth That Disappears, Bots That Bounce** | ✅ PASS | Better Auth magic-link plugin (server-side single-use tokens, 5-min expiry) + custom device-PIN service (argon2id-hashed, 5-strike lockout) + Cloudflare Turnstile on email entry form + rate limiting via Vercel KV or Upstash per email and per IP. PINs never leave server-side; client only ever sees "valid/invalid" responses. |
| **V. Auditable History (No Hard Deletes)** | ✅ PASS | Domain tables (`consumptions`, `bet_transfers`, `payments`, `stock_changes`) have no `DELETE` paths in application code. Void/dispute/adjustment is implemented by inserting compensating rows or marker rows (`void_markers` table or `voided_at` / `voided_by_user_id` columns). `actor_user_id` and `created_at` are NOT NULL on every domain row. |
| **VI. Free-Tier First, Scale on Demand** | ✅ PASS | Vercel Hobby (3 production deployments, 100 GB bandwidth) + Neon Free (0.5 GB storage, autosuspend) + Resend Free (3000/month, well above 20-member needs) + Cloudflare Turnstile (free) + Better Auth (open source, self-hosted in the Next.js process) + Upstash Redis Free (10k commands/day) for rate limiting if needed. No paid services required for v1. |

**Result: No violations. No Complexity Tracking required.**

## Project Structure

### Documentation (this feature)

```text
specs/001-beer-consumption-ledger/
├── plan.md                       # This file
├── research.md                   # Phase 0 — decisions for each unknown
├── data-model.md                 # Phase 1 — entity schemas and relationships
├── quickstart.md                 # Phase 1 — dev-env bootstrap walkthrough
├── checklists/
│   └── requirements.md           # Spec quality checklist (from /speckit-specify)
├── contracts/                    # Phase 1 — interface contracts
│   ├── auth.md                   # sign-in, PIN setup, unlock, sign-out
│   ├── consumption.md            # log beer, void consumption, list session
│   ├── payments.md               # settle, mark-paid, confirm, dispute, treasurer-manual
│   ├── bets.md                   # create / void bet transfer
│   ├── stock.md                  # restock, adjust, beer-type CRUD
│   └── admin.md                  # invitations, role changes, club settings
└── spec.md                       # Feature specification
```

### Source Code (repository root)

Single Next.js application; no separate frontend/backend split. Server Components handle reads; Server Actions handle mutations.

```text
beeromat/
├── app/
│   ├── [locale]/                  # next-intl locale segment
│   │   ├── (auth)/                # Magic-link + invitation paths
│   │   │   ├── sign-in/
│   │   │   └── invitation/[token]/
│   │   ├── (app)/                 # Authenticated, PIN-gated
│   │   │   ├── layout.tsx         # PIN gate component
│   │   │   ├── log/               # US 1: log a beer
│   │   │   ├── tab/               # US 1: my tab
│   │   │   ├── settle/            # US 2: pay my tab (QR/Revolut)
│   │   │   ├── bet/               # US 6: bet transfer
│   │   │   ├── history/           # US 8: cross-session history
│   │   │   └── admin/             # Role-gated admin/treasurer/stock-mgr
│   │   │       ├── pending/       # US 3: treasurer confirms claims
│   │   │       ├── members/       # admin: invite + role mgmt
│   │   │       ├── beer-types/    # stock-mgr: catalog + restock
│   │   │       └── settings/      # admin: club config (currency, IBAN, …)
│   │   └── layout.tsx
│   ├── api/
│   │   └── auth/[...all]/route.ts # Better Auth route handler mount
│   ├── manifest.ts                # PWA manifest (Next.js 16 native)
│   ├── icon.tsx                   # App icon
│   └── opengraph-image.tsx
├── components/
│   ├── ui/                        # shadcn/ui primitives (button, dialog, sonner, …)
│   ├── log/                       # log-screen components
│   ├── settle/                    # QR display, "I paid" button
│   ├── treasurer/                 # pending-confirmation list
│   ├── admin/                     # club-settings forms
│   └── pin/                       # PIN gate + numpad
├── lib/
│   ├── auth/
│   │   ├── better-auth.ts         # Better Auth server config (magic-link plugin)
│   │   ├── client.ts              # Better Auth client
│   │   ├── pin.ts                 # device-PIN service (argon2id)
│   │   └── session.ts             # combined session helpers
│   ├── db/
│   │   ├── schema/                # Drizzle table definitions, one file per concept
│   │   ├── client.ts              # Neon serverless driver + Drizzle instance
│   │   └── queries/               # typed query helpers
│   ├── balance/                   # effective-consumption + balance calculation
│   ├── qr-platba/                 # SPAYD string builder + qrcode SVG rendering
│   ├── permissions/               # role-based access checks
│   ├── rate-limit/                # magic-link + Turnstile rate-limiting wrapper
│   ├── i18n/                      # next-intl request configuration
│   └── env.ts                     # typed environment variables (Zod-validated)
├── messages/                      # i18n catalogs
│   ├── cs.json
│   └── en.json
├── drizzle/                       # generated migration SQL
├── drizzle.config.ts              # Drizzle Kit configuration
├── tests/
│   ├── unit/                      # Vitest specs (lib/, server actions)
│   ├── integration/               # Vitest + PGlite (db/queries, balance calc)
│   └── e2e/                       # Playwright (auth flow, settle flow, PWA install)
├── public/
│   ├── icons/                     # PWA icons (192, 512, maskable)
│   └── favicon.ico
├── .env.example                   # Deployment-scoped env vars only (no club config)
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── package.json
└── README.md
```

**Structure Decision**: Single Next.js application (Option 2 "web application" from the template, simplified — no separate backend project). The App Router's Server Component + Server Action model collapses what would have been a separate REST API into the same project, which fits a single-deployer single-club v1 perfectly and removes a layer of API plumbing.

## Phase 0 — Research

See [research.md](./research.md) for the full decision log. Topics resolved:

1. **Auth library**: Better Auth + magic-link plugin (Auth.js maintainers themselves now defer to Better Auth as of 2026)
2. **Device PIN integration**: custom service layered on top of Better Auth's session; not a Better Auth plugin
3. **i18n**: next-intl, locale-segment routing
4. **PWA**: `app/manifest.ts` only; no service worker in v1
5. **Testing**: Vitest + PGlite for unit/integration; Playwright for E2E and async Server Components
6. **PIN hashing**: `argon2` npm package (argon2id, 100–300ms per hash)
7. **QR Platba format**: SPAYD/SPD v1.0 (e.g., `SPD*1.0*ACC:CZ7603…*AM:200.00*CC:CZK*X-VS:1234…*MSG:…`)
8. **Migrations**: `drizzle-kit generate` for versioned SQL files in production; `drizzle-kit push` for local dev iteration
9. **Cloudflare Turnstile**: server-side `siteverify` POST inside the magic-link request Server Action

All NEEDS CLARIFICATION resolved. Plan is ready for Phase 1.

## Phase 1 — Design & Contracts

Outputs in this directory:

- **[data-model.md](./data-model.md)** — 14 tables (11 domain entities + 3 supporting): clubs, club_banking_profiles, members, invitations, device_sessions, beer_types, drink_sessions, consumptions, consumption_voids, bet_transfers, bet_transfer_voids, stock_changes, payments, payment_state_transitions. All carry `club_id`, `created_at`, `created_by_user_id` per Principle II/V.
- **[contracts/](./contracts/)** — 6 contract documents listing Server Action / Query signatures with input/output Zod-schema sketches.
- **[quickstart.md](./quickstart.md)** — clone → install → set up Neon branch → run migrations → seed a club → start dev server → log a beer.

### Constitution Check (post-design)

Re-evaluated after data-model + contracts:

- **II. Tenant-Aware Schema**: ✅ Verified — every `data-model.md` table includes a `club_id` NOT NULL FK; check constraints on every query enforce club scoping; row-level club isolation is the responsibility of every Server Action via `requireMember(clubId)` helper.
- **V. Auditable History**: ✅ Verified — no domain table has a `DELETE` operation in the contracts. Void/dispute is `INSERT INTO consumption_voids …`, never `DELETE FROM consumptions`.
- All other principles unchanged from pre-research check.

**Post-design verdict: PASS, no Complexity Tracking entries needed.**

## Phase 2 — Tasks (NOT generated by /speckit-plan)

Generated by `/speckit-tasks` from this plan + the spec. The task list will follow the user-story priority order (P1 stories first) so each slice can be delivered independently and validated against its `Independent Test` criterion from the spec.

## Complexity Tracking

> **Empty** — Constitution Check passed without violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |
