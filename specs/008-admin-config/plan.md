# Implementation Plan: Admin Configuration + Self-Bootstrap (v1.8)

**Branch**: `008-admin-config` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-admin-config/spec.md`

## Summary

v1.8 turns beeromat into a self-bootstrapping product. Today, every
club-scoped setting (name, currency, default locale, banking profile)
is fixed at deploy time via `SEED_*` env vars; changing any of them
needs a redeploy. v1.8 ships two reinforcing changes that, together,
let an admin deploy and configure the app entirely from inside it:

1. **First-user self-bootstrap**: a single transactional branch in the
   magic-link verification path. When the `users` table is empty and
   exactly one `clubs` row exists (the seed), the FIRST email that
   completes the magic-link round-trip is auto-promoted to
   `club_admin` on that seeded club. Once `users` is non-empty, the
   branch never fires again — the existing v1.5 not-on-allowlist
   behaviour remains the single sign-in path for every subsequent
   request.

2. **`/admin/config` editor**: a new admin-only page + server action
   that loads the current `clubs` row + `club_banking_profiles` row,
   renders them in a react-hook-form (the v1.2 forms layer), and
   saves edits transactionally through the existing `requireRole`
   RBAC guard.

The combined effect: `git push → vercel deploys → admin signs in →
lands at /admin/config → renames the club, sets currency + IBAN →
invites first members`. No terminal, no env-var rewrite, no manual
seeding.

Zero new dependency, zero new entity (the bootstrap reuses the seeded
`clubs` row; the editor reuses the existing `clubs` + `club_banking_profiles`
schema). One small migration MAY be needed if `club_banking_profiles`
lacks any column we need for the editor; verified during Phase 1.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict, constitution-pinned).

**Primary Dependencies**: Next.js 16 (App Router), React 19.2,
next-intl 4, Better Auth 1.x (magic-link plugin), Drizzle ORM 0.45.x,
`react-hook-form` + `@hookform/resolvers` + `zod` (the v1.2 forms
layer). **No new dependency.**

**Storage**: Neon Postgres via Drizzle. The `clubs` and
`club_banking_profiles` tables exist from v1; v1.8 reads/writes
their existing columns. A small Drizzle migration MAY add one
banking-profile column if the editor needs it (data-model.md confirms
exact shape).

**Testing**: Vitest + PGlite (unit) for the bootstrap status-mapping
logic; Playwright (E2E) for the two end-to-end flows — fresh-deploy
first-user-becomes-admin (new spec) and admin edits config
(extension to the existing admin specs). Mailpit for the magic-link
side.

**Target Platform**: mobile-first / mobile-only PWA, baseline
360×640. The `/admin/config` form must render correctly on a phone
(the admin will likely set up their club from their phone, not a
desktop).

**Performance Goals**: The bootstrap check adds one `SELECT COUNT(*)
FROM users` to the magic-link verify hook. p95 < 5ms (PG count on an
empty / tiny table) — negligible. The `/admin/config` page renders
one `clubs` row + one banking-profile row, no aggregation.

**Constraints**:
- Constitution Principle II — admin-UI-driven config; v1.8 makes this
  enforceable for the first time.
- Principle IV — invitation-only auth; the bootstrap is a one-shot
  exception gated by `users` table emptiness AND existing Turnstile +
  rate-limit + magic-link round-trip (SR-001, SR-002).
- Principle V — `clubs` row is updated in place; v1.8 does NOT add a
  config-change history table (Out of Scope item 5). The
  *reversibility* of a config change is the admin re-editing it.
- v1.2 forms standard — react-hook-form + Zod, locale-aware errors,
  no native validation.
- v1.6 i18n parity — every new copy string in cs + en;
  `pnpm i18n:check` blocks the merge if either is missing.
- Principle VII (added v1.7.0) — the lockfile is in sync with the
  Tech Stack table; this feature adds no dep, so no Tech Stack
  change.

**Project Type**: Web application (single Next.js app, App Router).

**Scale/Scope**: 1 new page (`/admin/config`), 1 new server action
(`updateClubConfig`), 1 new modification to an existing action
(`requestMagicLinkAction` adds the bootstrap branch via Better
Auth's `signInMagicLink` post-hook OR the verify callback —
data-model.md picks the exact hook). 1 new admin form component
(reusing `Form` / `FormField` / `Input` / `Button` primitives).
~10 new i18n keys per locale (field labels, save button, currency
warning, validation errors, bootstrap-flash if added).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.7.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Honored | `/admin/config` is a small form usable one-thumb on a 360-wide viewport; existing primitives (44px touch targets, 14px-radius cards) carry through. |
| II. Tenant-aware schema, single-club UX | ✅ **Directly advances it** | The whole feature is the canonical Principle II implementation — tenant config moves from env to admin UI. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched. |
| IV. Auth that disappears, bots bounce | ⚠ Trade documented in spec §SR-001 | The bootstrap is a one-shot exception, gated by `users` table emptiness AND the existing Turnstile + rate-limit + magic-link round-trip. After bootstrap fires, invitation-only is restored. Not a public sign-up path. |
| V. Auditable history — incl. UI-reversibility | ✅ Honored (config-change history Out of Scope) | The `clubs` row is updated in place; the user-facing reversibility of a config change is the admin re-editing it. A richer history table is deferred to a future spec. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure. |
| VII. Fresh Code Hygiene (added v1.7.0) | ✅ Honored | Zero new dep; Tech Stack table unchanged; the v1.7 dep-sweep already brought the lockfile in sync. |
| i18n section (catalog, `Intl.*`) | ✅ Honored | Every new string in cs + en; the `Intl.NumberFormat` chain already in `lib/format.ts` is what propagates a currency change to every money-display screen. |
| Forms standard (`forms:check`, v1.6) | ✅ Honored | The admin-config form uses react-hook-form + Zod (the v1.2 forms layer); no native date/time/required. |
| Test/Prod Code Separation (v1.3) | ✅ Unaffected | The bootstrap branch is real product logic, not a test branch. Test config of users-empty state is achieved through fixtures (PGlite + truncate), not code branches in `lib/auth/actions.ts`. |

**Notable**: the Principle IV note (SR-001) is the only "amber" cell.
The spec's Security Requirements section justifies the bootstrap-as-
exception rigorously; nothing further needs to land in the plan to
escalate. The constitution amendment threshold (a new MUST principle)
is not reached — this is one well-bounded exception, not a relaxation
of the principle.

## Project Structure

### Documentation (this feature)

```text
specs/008-admin-config/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # /speckit-specify output
├── data-model.md        # Phase 1 output — entities edited + bootstrap state machine
├── quickstart.md        # Phase 1 output — how to drive the feature end-to-end
├── contracts/
│   └── admin-config.md  # Phase 1 output — updateClubConfig + bootstrap-branch contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (already exists)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

No `research.md` — the spec has zero NEEDS CLARIFICATION markers and
no third-party-pattern research is needed (every choice is in the
project's existing pattern set: Better Auth callbacks, Drizzle
queries, react-hook-form, RBAC via requireRole).

### Source Code (repository root)

```text
app/
├── [locale]/
│   ├── (auth)/sign-in/
│   │   ├── page.tsx              # existing — no change for bootstrap (Better Auth handles dispatch)
│   │   └── SignInForm.tsx        # existing — no change (bootstrap is server-side only)
│   └── (app)/admin/
│       ├── config/
│       │   ├── page.tsx          # NEW — server component, loads club + banking, renders AdminConfigForm
│       │   ├── AdminConfigForm.tsx  # NEW — client component, react-hook-form + Zod
│       │   └── actions.ts        # NEW — updateClubConfig server action
│       └── members/              # existing — unchanged

lib/
├── auth/
│   ├── better-auth.ts            # MODIFIED — magic-link sendMagicLink callback or onVerify hook gets the bootstrap branch
│   ├── actions.ts                # MAYBE MODIFIED — requestMagicLinkAction may need a post-verify hook for the bootstrap
│   └── session.ts                # existing — no change (requireRole already enforces club_admin)
├── validation/
│   └── admin-config.ts           # NEW — Zod schema for club + banking-profile fields
└── db/queries/
    └── club-config.ts            # NEW — typed Drizzle queries for reading and updating the club + banking-profile rows together transactionally

drizzle/
└── NNNN_admin_config.sql         # MAYBE NEW — only if club_banking_profiles is missing a column the editor needs

messages/
├── cs.json                       # MODIFIED — new admin.config.* namespace
└── en.json                       # MODIFIED — parity

tests/
├── unit/
│   └── bootstrap-rule.spec.ts    # NEW — unit test of the users-empty → first-user-becomes-admin branch
└── e2e/
    └── admin-config.spec.ts      # NEW — end-to-end: sign in to a fresh DB, become admin, edit config, verify propagation
```

**Structure Decision**: Reuses the existing v1 project layout
exactly — no new top-level directories. The admin section already
lives under `app/[locale]/(app)/admin/`; the config page slots in
alongside `admin/members`. The bootstrap branch is co-located with
the existing magic-link wiring in `lib/auth/`. Validation schemas
live under `lib/validation/` next to `auth.ts` and `invitation.ts`.
DB queries co-locate under `lib/db/queries/` alongside `invitations.ts`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify. The one amber cell (Principle IV — the
bootstrap exception) is fully addressed in the spec's §Security
Requirements (SR-001 / SR-002 / SR-003) and does not require a
Complexity Tracking entry — it's a documented narrow exception, not
a relaxation.
