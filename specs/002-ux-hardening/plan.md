# Implementation Plan: UX Hardening (v1.1)

**Branch**: `002-ux-hardening` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-ux-hardening/spec.md`

## Summary

v1.1 hardens the *presentation and navigation* of the shipped beeromat v1
product against the eight P0/P1 findings of the post-implementation UX review.
It introduces no domain entities and changes no balance/payment/stock/bet
logic. The work is: localize every screen and add an enforced `i18n:check`
gate; enlarge touch targets; restructure the treasurer pending row; surface the
existing confirm-undo capability; add a forgot-PIN escape on the unlock screen;
give the bet dead-end a next step; add a persistent bottom nav + an Admin hub;
and add route-level loading skeletons.

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router, Server Components, Server
Actions), React 19.2, next-intl 4 (locale-segment routing, `cs`/`en`),
Tailwind CSS 4, shadcn/ui over base-ui, sonner (toasts)

**Storage**: Neon Postgres via Drizzle ORM — **unchanged**. v1.1 adds no
tables, columns, or migrations.

**Testing**: Vitest + PGlite (unit/integration), Playwright (E2E against the
production build); plus the new `i18n:check` script as the sixth gate.

**Target Platform**: mobile-first installable PWA; modern evergreen browsers;
primary form factor a 360×640 phone.

**Project Type**: Web application (single Next.js app, App Router).

**Performance Goals**: screen-transition feedback visible within 300 ms
(SC-008); the v1 logging golden path (<10 s) MUST NOT regress.

**Constraints**: every primary action control ≥44×44 px at 360×640; no new
domain entities (FR-016); free-tier infrastructure unchanged; the persistent
nav must not occlude content or the on-screen keyboard.

**Scale/Scope**: one ~20-member club; ~15 screens to localize and re-navigate;
two locale catalogs (`cs`, `en`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.4.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Advances it | US2 (44px) and US7 (persistent nav) are direct one-thumb improvements. |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched. |
| IV. Auth that disappears, bots bounce | ✅ Honored | US5 forgot-PIN reuses the magic-link path **with** its existing Turnstile + rate limiting (FR-010). |
| V. Auditable history — incl. v1.4.0 UI-reversibility clause | ✅ Directly satisfies | US4 surfaces `voidConfirmedPayment` in the UI — this story exists *because* of the new clause. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure. |
| i18n section (catalog, `Intl.*`) | ✅ Directly satisfies | US1 brings the UI into compliance the v1 build violated. |
| Verification Gates — sixth gate `i18n:check` | ✅ Created here | US1 builds the gate itself. |
| Spec & Task Discipline — Verifiable Tasks | ✅ Honored | i18n is bound to a gate, not a bare task. |
| Spec & Task Discipline — personas mandatory | ✅ Honored | spec.md has the Personas section; scenarios name personas. |
| Spec & Task Discipline — verification infra Foundational | ✅ N/A-reuse | The E2E rig already exists from v1; v1.1's Foundational phase *extends* it (i18n gate, viewport helper), it is not rediscovered. |
| Test/Prod Code Separation (hard rule) | ✅ Honored | No test-only branches; `i18n:check` is a build script, not prod code. |

**Result: PASS.** No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-ux-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (states: no changes)
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui.md            # Phase 1 output — UI/navigation/gate contracts
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root) — existing Next.js app, files this feature touches

```text
app/[locale]/
├── (app)/
│   ├── layout.tsx                 # + persistent bottom nav
│   ├── loading.tsx                # NEW — route-level skeleton (US8)
│   ├── page.tsx                   # localize; nav replaces ad-hoc links
│   ├── log/ tab/ settle/ bet/     # localize; per-route loading.tsx
│   ├── history/                   # localize
│   └── admin/
│       ├── page.tsx               # NEW — Admin hub (US7)
│       ├── members/ settings/banking/ beer-types/   # localize; reached via hub
│       └── pending/               # localize + pending-row restructure (US3) + confirm-undo (US4)
└── (auth)/
    ├── sign-in/ invitation/       # localize
    └── ...                        # PIN unlock screen — forgot-PIN affordance (US5)

components/
├── nav/bottom-nav.tsx             # NEW — persistent nav (US7)
├── treasurer/pending-list.tsx     # restructure rows (US3) + undo action (US4)
├── pin/pin-gate.tsx               # forgot-PIN affordance (US5)
├── bet/transfer-list.tsx          # no-session next-step (US6)
├── ui/button.tsx                  # touch-target sizing audit (US2)
└── ... (all components)           # localize literals

messages/
├── cs.json                        # full catalog (US1)
└── en.json                        # full catalog (US1)

scripts/
└── i18n-check.ts                  # the i18n:check gate (US1)

tests/e2e/
└── us2-1xx-*.spec.ts               # v1.1 story specs
```

**Structure Decision**: No structural change — v1.1 edits the existing Next.js
App Router tree in place. The only *new* files are `app/[locale]/(app)/admin/page.tsx`
(Admin hub), `components/nav/bottom-nav.tsx`, route `loading.tsx` files, an
expanded `scripts/i18n-check.ts`, and v1.1 E2E specs. Everything else is an
edit to an existing file.

## Complexity Tracking

No Constitution Check violations — this table is intentionally empty.
