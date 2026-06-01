# Implementation Plan: Recreate Last Match

**Branch**: `027-recreate-last-match` (spec dir only — trunk-based on `main`) | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-recreate-last-match/spec.md`

## Summary

Add a one-tap "Recreate last match" control to the top of the `/match` hub. It resolves the acting member's most-recently-created match agreement (any state — open/recorded/cancelled), labels itself with that matchup ("Franta + Pepa vs Honza + Standa"), and on tap creates a new OPEN agreement cloning the lineup/format/for-beer/pairing, then navigates to the new agreement's detail page. Reuses `createAgreementTx` for the create (so members-in-club + duplicate-member guards apply for free) and adds an active-participant guard so a stale roster yields a clear error instead of a 500.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19 / Next.js 16 App Router (Server Components + Server Actions).

**Primary Dependencies**: Drizzle ORM 0.45.x + Postgres (PGlite for integration tests), next-intl 4.x, shadcn/ui + base-ui, Tailwind 4.

**Storage**: Postgres — existing `match_agreements` + `match_agreement_sides` tables. **No schema change.**

**Testing**: Vitest (unit/node, integration/PGlite, component/jsdom+RTL). No new E2E.

**Target Platform**: Mobile-first PWA, one-thumb.

**Project Type**: Web application (Next.js single app).

**Performance Goals**: One extra indexed query on the `/match` hub load (resolve last agreement for member) + reuse of the existing create transaction on tap. Negligible at a 20-member club's scale.

**Constraints**: Czech-first i18n (cs + en catalogs, no literal strings). Tenant-scoped by `club_id`. No hard deletes — recreate appends a new agreement, never mutates the source.

**Scale/Scope**: One new query helper, one new server action, one new client component, one wiring change on the hub page, plus i18n keys. ~4 source files + 3 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. The recreate control is a single full-width tap target at the top of the hub; one-thumb, no precision needed.
- **II. Tenant-Aware Schema, Single-Club UX** — PASS. The new last-match query filters by `club_id` (and member participation). The create reuses `createAgreementTx` which is already club-scoped.
- **III. Track, Don't Transact** — PASS. No money path touched.
- **IV. Auth That Disappears** — PASS. The action calls `requireUnlocked()` exactly like `createAgreementAction`; no new auth surface.
- **V. Auditable History (No Hard Deletes)** — PASS. Recreate **creates** a new agreement (append-only); the source agreement is untouched. No deletes, no mutations.
- **VI. Free-Tier First** — PASS. One indexed read per hub load + one existing transaction per tap. No new infra.
- **VII. Fresh Code Hygiene** — PASS. No new dependencies; reuses existing primitives (`createAgreementTx`, `joinSideNames`, `MemberPickerDropdown` is not even needed — this is label + button only).
- **VIII. Testing Pyramid** — PASS. See test layer declaration below.
- **i18n catalog (Tech Stack constraint)** — PASS. Three new keys, cs + en, verified by `i18n:check`.

No violations → Complexity Tracking section omitted.

### Test layer declaration

*Required by Principle VIII.*

- **Unit (`pnpm test:unit`)** — N/A. No new pure functions; the lineup → clone-input mapping is a trivial projection exercised end-to-end by the integration tests, and `joinSideNames` (the label builder) already has unit coverage from spec 013.
- **Integration (`pnpm test:integration`)** — YES. The new `lastAgreementForMember` query (most-recent-by-createdAt, participant-filtered, any state, per-club scoping, empty) and the `recreateLastMatchAction` (happy clone for singles + doubles, no-prior-match, inactive-participant block, cancelled-source clone, per-club scoping). This is the DB-coupled heart of the feature.
- **Component (`pnpm test:component`)** — YES. The `RecreateLastMatchButton` client component: renders the matchup label, dispatches the action, navigates on success, surfaces the typed error toast. (The "hidden when no prior match" case is a server-side render decision on the hub page — covered by the integration test for the query returning null + the component simply not being rendered; the component test covers the present-and-labelled path.)
- **E2E (`pnpm test:e2e`)** — N/A. Per Constitution v1.10.0, E2E layers are deferred until a crucial-journey suite is spec'd; this is an incremental shortcut on an existing journey, not a new crucial journey. No new E2E.

## Project Structure

### Documentation (this feature)

```text
specs/027-recreate-last-match/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (recreate action contract)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
lib/db/queries/match-agreements.ts        # + lastAgreementForMember() query helper
app/[locale]/(app)/match/actions.ts       # + recreateLastMatchAction() server action
components/match/recreate-last-match-button.tsx   # NEW client component (label + tap)
app/[locale]/(app)/match/page.tsx         # wire the button in (resolve last match, render when present)
messages/cs.json, messages/en.json        # recreate label, matchup template, stale-participant error

tests/integration/last-agreement-for-member.spec.ts   # NEW
tests/integration/recreate-last-match-action.spec.ts  # NEW
tests/component/recreate-last-match-button.spec.tsx    # NEW
```

**Structure Decision**: Single Next.js app. The feature slots into the existing match-agreement query module, the existing match actions module, and the existing `/match` hub page — no new architectural layer. The only new file types are one client component and three test files.

## Complexity Tracking

*No constitution violations — section intentionally empty.*
