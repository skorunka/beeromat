# Implementation Plan: Forms & Input Hardening (v1.2)

**Branch**: `003-forms-input-hardening` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-forms-input-hardening/spec.md`

## Summary

v1.2 migrates every form in the shipped beeromat product off browser-native
validation onto an in-app, locale-aware validation layer, implementing the
constitution v1.5.0 *User Input & Forms* standard. Today the 11 forms validate
with ad-hoc per-field `useState` + hand-written checks, lean on the HTML
`required` attribute (which triggers the browser's unstyled, locale-blind
validation bubble), and show feedback inconsistently (some a `<p>`, some a
sonner toast). Server-side Zod validation exists in some actions and is
hand-rolled in others.

The work: adopt `react-hook-form` + `@hookform/resolvers` with a Zod resolver;
extract one **shared Zod schema per form** into `lib/validation/` so the
client form and the Server Action validate against the *same* rules; have
schemas emit **catalog message keys** (not literal text) so every error renders
through `next-intl` in the active locale and the mate-to-mate tone; build a
small shadcn-style `Form` primitive set so all forms render field errors
identically and accessibly; and add a `forms:check` verification gate that
fails the build on a native date/time input or a native `required`/`pattern`
constraint. It introduces **no domain entities**, changes **no balance /
payment / stock / bet logic**, and changes **no Server Action contract**.

Per the resolved User Story 4 decision, the locale-aware date-picker
*component* is **not built** — no screen collects a date — only the guardrail
ships.

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router, Server Components, Server
Actions), React 19.2, next-intl 4 (`cs`/`en` catalogs), Tailwind CSS 4,
shadcn/ui over base-ui, sonner. **New**: `react-hook-form` 7.76.x,
`@hookform/resolvers` 5.4.x. `zod` 4.4.x is **already** a dependency (used
server-side); v1.2 promotes those schemas to shared client+server schemas.

**Storage**: Neon Postgres via Drizzle ORM — **unchanged**. v1.2 adds no
tables, columns, or migrations.

**Testing**: Vitest + PGlite (unit/integration), Playwright (E2E against the
production build). **New**: a `forms:check` script joins `i18n:check` as a
verification gate.

**Target Platform**: mobile-first installable PWA; modern evergreen browsers;
primary form factor a 360×640 phone.

**Project Type**: Web application (single Next.js app, App Router).

**Performance Goals**: no regression to the v1 logging golden path (<10 s);
form interaction (focus → error feedback) feels immediate (<100 ms perceived).
The two new client libraries add a small, well-understood bundle cost only to
routes that carry a form.

**Constraints**: no browser-native validation bubble may appear on any form
(FR-001); every validation message flows through the catalog (FR-003) and is
covered by `i18n:check`; client and server validate against one shared schema
(FR-004); no Server Action contract change (FR-014); all controls keep the
≥44 px touch target from v1.1 (FR-013); free-tier infrastructure unchanged.

**Scale/Scope**: one ~20-member club; **11 forms** across 9 component files
and ~7 Server Action files; two locale catalogs (`cs`, `en`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.5.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Advances it | Replacing native popups with in-context, ≥44 px-target field errors is a direct one-thumb / small-screen improvement (SC-005). |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched; money *forms* are re-validated, the actions behind them are not. |
| IV. Auth that disappears, bots bounce | ✅ Honored | FR explicitly preserves Turnstile on sign-in and the PIN attempt-limit / lockout; the sign-in/PIN forms are re-validated, their security path is not. |
| V. Auditable history — incl. UI-reversibility clause | ✅ Unaffected | No domain rows, no action contracts changed. |
| VI. Free-tier first | ✅ Unaffected | Two small client libraries; no new infrastructure. |
| i18n section (catalog, `Intl.*`) | ✅ Directly satisfies | All new validation messages are catalog strings; `i18n:check` (gate 6) covers them. |
| **User Input & Forms (v1.5.0)** | ✅ **This feature implements it** | v1.2 *is* the ratified migration of existing forms onto the standard. |
| Verification Gates | ✅ Adds a gate | `forms:check` joins the existing gates (FR-016 / SC-006), the same way `i18n:check` was added in v1.1. |
| Tech-stack table — new dependencies | ✅ Pre-blessed | `react-hook-form` + Zod resolver are *named by constitution v1.5.0 itself* as the chosen standard — adopting them needs no amendment. Versions are web-verified latest stable (see research.md). |
| Test/Prod Code Separation (hard rule) | ✅ Honored | Shared schemas in `lib/validation/` are production code used by both client and action; `scripts/forms-check.ts` is a build script, not shipped code. Zero test-only branches in `lib/`, `app/`, `components/`. |
| Spec & Task Discipline — personas, verifiable tasks, verification infra | ✅ Honored | spec.md carries the Personas section and persona-named scenarios; every story is bound to `forms:check` + E2E, not a bare task; the E2E rig already exists from v1 and is extended, not rediscovered. |

**Result: PASS.** No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-forms-input-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output — library versions + the 4 design decisions
├── data-model.md        # Phase 1 output — no DB change; the shared-schema / error-key model
├── quickstart.md        # Phase 1 output — how to verify v1.2
├── contracts/
│   └── forms.md         # Phase 1 output — form-layer, validation, and gate contracts
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — files this feature adds or touches

```text
lib/validation/                    # NEW — one shared Zod schema module per form domain
├── auth.ts                        #   sign-in email; PIN setup / unlock
├── invitation.ts                  #   invitation accept (display name)
├── members.ts                     #   member invite (email + role)
├── banking.ts                     #   banking profile (IBAN, holder, Revolut, QR message)
├── beer-types.ts                  #   beer-type add / edit
├── stock.ts                       #   restock / stock adjust
├── payments.ts                    #   settle "paid another way"; treasurer manual payment
└── messages.ts                    #   the error-key constants schemas emit (catalog keys)

components/ui/
└── form.tsx                       # NEW — shadcn-style RHF primitives:
                                   #   Form, FormField, FormItem, FormLabel,
                                   #   FormControl, FormMessage, FormRootError

components/                        # the 9 form-bearing component files — migrated to RHF
├── pin/pin-gate.tsx               #   US1 — PIN setup + unlock
├── admin/invite-form.tsx          #   US3 — member invite
├── admin/banking-form.tsx         #   US3 — banking profile
├── admin/beer-type-manager.tsx    #   US3 — beer-type add/edit, restock, adjust
├── treasurer/manual-payment-form.tsx  # US2 — treasurer manual payment
└── settle/paid-other-method.tsx   #   US2 — settle "paid another way"

app/[locale]/(auth)/
├── sign-in/SignInForm.tsx         # US1 — sign-in email
└── invitation/[token]/InvitationForm.tsx  # US1 — invitation accept

app/[locale]/(app)/                # Server Action files — import the shared schema,
├── admin/beer-types/actions.ts    #   replacing their inline z.object(); contract unchanged
├── admin/settings/actions.ts      #   banking
├── admin/balances/actions.ts      #   manual payment
├── admin/members/actions.ts       #   member invite (gains a schema where it hand-rolled)
├── settle/actions.ts              #   settle (gains a schema where it hand-rolled)
└── (auth via lib/auth/actions.ts) #   sign-in / PIN (gains a schema where it hand-rolled)

messages/
├── cs.json                        # + `forms` error namespace (reuse existing keys where present)
└── en.json                        # + `forms` error namespace

scripts/
└── forms-check.ts                 # NEW — the forms:check gate (no native date/time inputs;
                                   #   no native `required`/`pattern` constraints)

tests/e2e/
└── us3-1xx-forms-*.spec.ts        # NEW — v1.2 story specs (one acceptance scenario each)
```

**Structure Decision**: No structural change to the App Router tree. v1.2
adds one new library-neutral directory (`lib/validation/`), one new UI
primitive file (`components/ui/form.tsx`), one new gate script, and v1.2 E2E
specs; everything else is an in-place edit to an existing form component,
Server Action, or catalog. Shared schemas live in `lib/validation/` — not
co-located with actions — so a `components/` form and an `app/` action can
both import them without a component reaching into a route folder, matching
the existing `lib/<domain>/` convention.

## Complexity Tracking

No Constitution Check violations — this table is intentionally empty.
