# Implementation Plan: Beer Breakdown on the Tab

**Branch**: `028-tab-beer-breakdown` (spec dir only — trunk-based on `main`) | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-tab-beer-breakdown/spec.md`

## Summary

Add a per-beer breakdown to `/tab`: group the member's countable tab entries by (beer type, day), show "{beer} ×{count} · {subtotal}" per group ordered by subtotal desc (days newest-first), with the breakdown's grand total equal to the existing tab total by construction. It's a **pure re-presentation** of the `MemberTabEntry[]` the tab page already loads — a pure grouping helper + a presentational component, no new query, no schema change. The existing chronological list (with per-beer Undo) stays below.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19 / Next.js 16 App Router.

**Primary Dependencies**: next-intl 4.x (plural-aware count copy), Tailwind 4, existing `formatMoney`. No new deps.

**Storage**: None touched — reads the already-fetched `getMyTabForSession` result. **No schema change, no new query.**

**Testing**: Vitest — unit (pure grouping helper) + component (breakdown render). No integration (no DB code), no E2E.

**Target Platform**: Mobile-first PWA.

**Project Type**: Web application (Next.js single app).

**Performance Goals**: Zero added DB work; one O(n) pass over the existing in-memory entries (n = beers this round, tiny).

**Constraints**: Czech-first i18n with correct plural forms. The breakdown grand total MUST equal `getMyTabForSession.totalMinor` (invariant).

**Scale/Scope**: One pure helper, one component, one wiring change on `/tab`, i18n keys. ~3 source files + 2 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. A compact summary block; read-only, one-thumb.
- **II. Tenant-Aware Schema** — PASS. No new data access; the tab query (already club + member scoped) is the tenant boundary. The helper is a pure transform of its output.
- **III. Track, Don't Transact** — PASS. No money movement; display only.
- **IV. Auth That Disappears** — PASS. No new action or auth surface; renders inside the existing authenticated `/tab` page.
- **V. Auditable History (No Hard Deletes)** — PASS. Read-only; nothing written.
- **VI. Free-Tier First** — PASS. No new infra; no added queries.
- **VII. Fresh Code Hygiene** — PASS. No new dependencies; reuses `MemberTabEntry`, `formatMoney`, next-intl plural.
- **VIII. Testing Pyramid** — PASS. See declaration below.
- **i18n catalog (Tech Stack constraint)** — PASS. New keys cs + en, plural-aware, `i18n:check` gated.

No violations → Complexity Tracking omitted.

### Test layer declaration

*Required by Principle VIII.*

- **Unit (`pnpm test:unit`)** — YES. The pure grouping helper (`groupTabEntriesByBeer`) is the heart of the feature: bet-adjusted inclusion/exclusion (self + transfer_in counted; transfer_out + voided excluded), (type, day) bucketing, subtotal math, sort order, the grand-total-equals-tab-total invariant, and empty input. This is exactly the cheapest layer the constitution wants for pure logic.
- **Integration (`pnpm test:integration`)** — N/A. No new DB code; the data source (`getMyTabForSession`) already has its own integration + parity coverage (tab-total-bet-parity, tab-revoided-transfer-fanout). The helper consumes its output.
- **Component (`pnpm test:component`)** — YES. The `TabBeerBreakdown` component: renders one row per group with name/count/subtotal, plural count copy (cs + en), hides on empty, and the grand total matches the summed subtotals.
- **E2E (`pnpm test:e2e`)** — N/A. Deferred per Constitution v1.10.0; this is a display refinement on an existing screen, not a new crucial journey.

## Project Structure

### Documentation (this feature)

```text
specs/028-tab-beer-breakdown/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/breakdown.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
lib/tab/group-beer-breakdown.ts              # NEW pure helper: MemberTabEntry[] -> BeerBreakdownGroup[]
components/tab/tab-beer-breakdown.tsx         # NEW presentational component
app/[locale]/(app)/tab/page.tsx              # wire the breakdown in above the chronological list
messages/cs.json, messages/en.json           # heading + plural count line

tests/unit/group-beer-breakdown.spec.ts      # NEW unit test
tests/component/tab-beer-breakdown.spec.tsx  # NEW component test
```

**Structure Decision**: Single Next.js app. New pure logic lives in a new `lib/tab/` helper (keeps it out of the component and trivially unit-testable). The component is presentational. The only edit to existing code is wiring on the tab page.

## Complexity Tracking

*No constitution violations — section intentionally empty.*
