# Implementation Plan: Admin Data Correction

**Branch**: `031-admin-data-correction` (authored on `main` — trunk-based) | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-admin-data-correction/spec.md`

## Summary

Give a `club_admin` surgical, direct control to keep balances honest:
(US1) void any consumption regardless of age or settled state, (US2)
reverse a confirmed payment, (US3) reach the existing match/bet reversals
for completeness. **Scope was narrowed 2026-06-11 at the user's request:
NO club-wide reset** — the admin clears test data record-by-record.

The decisive finding from code review: the two per-record mechanisms
**already exist as audited server actions** — `voidConsumptionAction`
(`app/[locale]/(app)/log/actions.ts`, already voids past the undo window
for override roles) and `voidConfirmedPaymentAction`
(`app/[locale]/(app)/admin/pending/actions.ts`, the very action
Constitution Principle V flagged as "implemented but reachable from no
screen"). So the feature is almost entirely **surfacing** those actions in
the admin member-detail view + broadening that view to all-time records +
verifying/widening admin authz. **No new destructive transaction.**

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict)
**Primary Dependencies**: Next.js 16 (App Router), React 19.2, Drizzle ORM 0.45.x, next-intl, base-ui (DropdownMenu/Dialog), react-hook-form + Zod
**Storage**: Neon Postgres (club-scoped, multi-tenant schema)
**Testing**: Vitest unit + integration (PGlite) + component (RTL/jsdom); Playwright E2E dormant
**Target Platform**: Mobile-first PWA; admin tooling also used on desktop
**Project Type**: Web application (Next.js App Router monorepo-style single app)
**Performance Goals**: Per-record corrections feel instant (one refresh). Club reset completes within a few seconds for a single club's data volume.
**Constraints**: Must preserve the balance-aggregation invariant; club-scoped (no cross-club read/write); prod-safe; reuse audited compensating-row mechanisms for corrections.
**Scale/Scope**: Single club, tens of members, low-thousands of operational rows at most.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. Admin tooling; controls are tap targets, work one-handed, no new desktop-only requirement.
- **II. Tenant-Aware, Single-Club UX** — PASS. Every read/write is `club_id`-scoped; the reset deletes only the acting admin's club rows. Admin-UI-driven (no env/config).
- **III. Track, Don't Transact** — PASS. No money movement; reversing a payment only corrects the ledger (cash handled out-of-band, documented assumption).
- **IV. Auth** — PASS. All capabilities gated to `club_admin` via `requireRole`.
- **V. Auditable History (No Hard Deletes)** — PASS, cleanly. Every correction is a compensating row (`consumption_voids`, `payment_state_transitions`); nothing is hard-deleted. The earlier club-reset tension is gone with that descope. This feature also *advances* Principle V's reversibility-is-a-UI-property clause by finally surfacing `voidConfirmedPaymentAction` (the action the clause was written about).
- **VI. Free-Tier First** — PASS. No new infra.
- **VII. Fresh Code Hygiene** — PASS. No dependency changes.
- **VIII. Testing Pyramid** — see declaration below.

### Test layer declaration

- **Unit (`pnpm test:unit`)** — authz predicate(s) for who may correct (club_admin override); any schema added for the admin surfaces.
- **Integration (`pnpm test:integration`)** — the bulk. `voidConsumptionAction` as admin on a settled/old consumption (balance → credit; idempotent ALREADY_VOIDED; bet-leg consistency); `voidConfirmedPaymentAction` (balance restored; idempotent; club-scoped/authz); the broadened `getMemberTabForAdmin` (returns all-time entries with a per-row admin canVoid).
- **Component (`pnpm test:component`)** — the admin void/reverse controls (confirm dialog fires the right action, disabled while pending, success/idempotent toasts).
- **E2E (`pnpm test:e2e`)** — **N/A**. The Playwright stack is dormant (removed 2026-05-26; first journey-spec would reinstate it). This feature is admin correction tooling, not a daily user journey; its risk is concentrated in DB transactions + authz, which the integration layer verifies directly. Consistent with spec 030's declaration.

## Project Structure

### Documentation (this feature)

```text
specs/031-admin-data-correction/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (server-action contracts)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
lib/db/queries/
└── consumption.ts               # MODIFY — getMemberTabForAdmin: return ALL-TIME entries (not just open session) + per-row admin canVoid; add admin confirmed-payments listing (here or payments.ts)

lib/auth/ or lib/permissions      # VERIFY/WIDEN — club_admin is an override role for voidConsumptionAction with no age/settled gate

app/[locale]/(app)/admin/balances/[memberId]/
└── page.tsx                     # MODIFY — list all-time consumptions w/ admin void control; list confirmed payments w/ reverse control

components/admin/
├── admin-void-consumption-button.tsx   # NEW — confirm (useConfirm) + voidConsumptionAction
└── admin-reverse-payment-button.tsx     # NEW — confirm + voidConfirmedPaymentAction

messages/cs.json, messages/en.json       # MODIFY — admin.* correction labels + confirm copy
```

**Structure Decision**: Single Next.js App Router app (existing layout). All corrections live under the existing `admin/balances/[memberId]` surface and reuse the existing audited actions (`voidConsumptionAction`, `voidConfirmedPaymentAction`). The only DB change is broadening `getMemberTabForAdmin` to all-time records + an admin confirmed-payments listing. No new schema, no new transaction, no destructive paths. Match/bet corrections (US3) reuse the existing `/match` reverse/cancel surfaces.

## Complexity Tracking

*No constitution violations — nothing to justify. (The earlier hard-delete tension was removed when the club-wide reset was descoped.)*
