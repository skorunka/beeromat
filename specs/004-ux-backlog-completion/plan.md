# Implementation Plan: UX Backlog Completion (v1.3)

**Branch**: `004-ux-backlog-completion` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-ux-backlog-completion/spec.md`

## Summary

v1.3 discharges the last seven items (§5 items 9–15) of the post-v1 UX review.
The work is presentation-layer only: one new member-facing **payment-history**
screen and a small **account hub** that finally surfaces sign-out; a
**friendlier stock UI** (Restock made dominant, the signed-delta adjust field
replaced by a positive quantity + Add/Remove choice); a **home balance that
refreshes** after a log; **friendlier empty/guidance states** (log empty
state, an actionable dispute banner); and **money-input helper text + a bet
transfer tally**. It adds no domain entities and changes no balance / payment
/ stock / bet calculation and no Server Action contract.

One query named in the v1 contracts but never built — `getPaymentHistory`
(`specs/001-beer-consumption-ledger/contracts/payments.md`) — is implemented
here as a read-only query over the existing `payments` and
`payment_state_transitions` tables. That is building a contracted-but-unbuilt
read path, not a new contract.

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router, Server Components, Server
Actions), React 19.2, next-intl 4 (`cs`/`en`), Tailwind CSS 4, shadcn/ui over
base-ui, sonner, `react-hook-form` 7.76 + `@hookform/resolvers` 5.4 + `zod` 4
(the v1.2 forms layer). **No new dependencies.**

**Storage**: Neon Postgres via Drizzle ORM — **unchanged**. No tables,
columns, or migrations. v1.3 adds one *read query* (`getPaymentHistory`) over
existing tables.

**Testing**: Vitest + PGlite (unit/integration), Playwright (E2E against the
production build). Seven verification gates incl. `i18n:check` and
`forms:check`.

**Target Platform**: mobile-first installable PWA; 360×640 baseline phone.

**Performance Goals**: no regression to the v1 logging golden path (<10 s);
the home balance reflects a log within one screen transition (SC-004).

**Constraints**: no new domain entity, no business-logic change, no Server
Action contract change (FR-018); every new string flows through the catalog
and `i18n:check` (FR-017); the migrated adjust form stays `forms:check`-clean
(FR-019); controls ≥44 px (FR-020); free-tier infrastructure unchanged.

**Project Type**: Web application (single Next.js app, App Router).

**Scale/Scope**: one ~20-member club; one new screen + one hub screen, ~6
existing screens/components refined, two catalogs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.6.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Advances it | US2 (Restock dominant, no signed numbers) and US4 (reachable sign-out) are direct one-thumb / occasional-user wins; all new controls ≥44 px. |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change; the payment-history query is club+member scoped like every other read. |
| III. Track, don't transact | ✅ Unaffected | No money movement; the payment-history screen is read-only. |
| IV. Auth that disappears, bots bounce | ✅ Honored | US4 surfaces the existing sign-out; sign-out clears the device session so the next visit is a clean magic-link sign-in. No change to the auth path itself. |
| V. Auditable history — incl. UI-reversibility clause | ✅ Directly satisfies | US1 gives the *member* a view of the payment audit trail that until now only the treasurer could see — more of the audit history surfaced in the UI, not less. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure or dependencies. |
| i18n section (catalog, `Intl.*`) | ✅ Honored | Every new string is a catalog key; `i18n:check` (gate 6) covers them. |
| User Input & Forms (v1.6.0) | ✅ Honored | The only form changed is stock-adjust (US2); it stays on the v1.2 react-hook-form + Zod layer with in-app validation — `forms:check` (gate 7) stays green. |
| Verification Gates — all seven | ✅ Honored | quickstart lists all seven; every acceptance scenario gets an E2E assertion (FR + SC-008). |
| Test/Prod Code Separation (hard rule) | ✅ Honored | No test-only branches in `lib/`/`app/`/`components/`. |
| Spec & Task Discipline — personas, verifiable tasks, verification infra | ✅ Honored | spec.md carries the Personas section and persona-named scenarios; the E2E rig already exists and is extended, not rediscovered. |

**Result: PASS.** No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-ux-backlog-completion/
├── plan.md              # This file
├── research.md          # Phase 0 — the design decisions (no new libraries)
├── data-model.md        # Phase 1 — no DB change; the getPaymentHistory read model
├── quickstart.md        # Phase 1 — how to verify v1.3
├── contracts/
│   └── ux.md            # Phase 1 — screen, query, and refinement contracts
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — files this feature adds or touches

```text
app/[locale]/(app)/
├── page.tsx                       # US3 — home greeting becomes an account link
├── account/
│   ├── page.tsx                   # NEW (US4) — member account hub: name,
│   │                              #   payment-history link, sign-out
│   └── payments/
│       └── page.tsx               # NEW (US1) — the member payment-history screen
├── log/
│   ├── page.tsx                   # US5 — friendly empty state when no beer types
│   └── actions.ts                 # US3 — log + undo actions also revalidatePath('/')
└── bet/
    └── page.tsx                   # US6 — surface the bet-transfer tally

lib/db/queries/
└── payments.ts                    # US1 — add getPaymentHistory (contracted, unbuilt)

lib/validation/
└── stock.ts                       # US2 — adjust schema: quantity + add/remove mode
                                   #   (replaces the signed `delta` field)

components/
├── account/
│   └── sign-out-button.tsx        # NEW (US4) — client control over signOutDeviceAction
├── payments/
│   └── payment-history-list.tsx   # NEW (US1) — renders the member's timeline
├── admin/beer-type-manager.tsx    # US2 — Restock dominant; AdjustForm → add/remove
├── dispute-banner.tsx             # US5 — actionable next-step link (F19)
├── bet/transfer-list.tsx          # US6 — per-session bet-transfer tally (F12)
├── settle/paid-other-method.tsx   # US6 — money-amount helper text (F17)
└── treasurer/manual-payment-form.tsx  # US6 — money-amount helper text (F17)

messages/
├── cs.json                        # + v1.3 keys (account, payments, stock add/remove…)
└── en.json                        # + v1.3 keys

tests/e2e/
└── ux2-*.spec.ts                  # v1.3 story specs (one per user story)
```

**Structure Decision**: No structural change to the App Router tree beyond a
new `account/` area under `(app)`. The payment-history screen lives at
`/account/payments` and the account hub at `/account`; the hub is reached by
making the existing home-screen greeting (`Ahoj {name}`) a tappable link —
the lowest-risk way to surface sign-out and payment history without
re-architecting the v1.1 bottom nav. `getPaymentHistory` is added to the
existing `lib/db/queries/payments.ts`. Everything else is an in-place edit.

## Complexity Tracking

No Constitution Check violations — this table is intentionally empty.
