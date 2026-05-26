# Implementation Plan: Home redesign + one-tap log-a-beer

**Branch**: direct-to-`main` (trunk-based per constitution).
**Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Constitution**: v1.10.0

## Summary

Make the authenticated `/` page the single action surface for the
daily core loop. Primary CTA is a one-tap "log my last beer" button
preset to the member's most recent non-voided beer; secondary is the
existing settle CTA, made less prominent. The "outstanding balance"
card becomes a friendly Czech/English sentence (no "dlužíš"). The
predictive default falls back gracefully when the last-beer is
archived, out of stock, or role-disallowed — all decisions folded
into the existing home-page query (no extra DB round-trip).

Implementation is tight by design: one new presentational
component (`HomeOneTapLog`), one new query helper (`lastBeerForMember`),
~10 catalog string additions, and rewiring of `app/[locale]/(app)/page.tsx`.
Reuses the existing `logBeer` server action verbatim — no new
transaction, no new schema, no new auth surface.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), constitution-pinned.

**Primary Dependencies**:
- Next.js 16.x App Router (existing)
- Drizzle ORM 0.45.x (existing)
- sonner (toast) — already in the shadcn set, already used elsewhere
- next-intl 4.x — catalogs in `messages/{cs,en}.json`
- lucide-react — for the beer-glass icon on the CTA

**Storage**: Existing Postgres (Neon proxy in prod, PGlite in
integration tests). No new tables. One existing column read
expanded (consumption → join beer_types) in the home query.

**Testing** *(per Constitution v1.10.0 Principle VIII)*:
See the Test Layer Declaration in the Constitution Check section
below — this is where the per-layer plan lives now.

**Target Platform**: Mobile-first PWA; modern Chrome/Safari/Edge on
phones and desktop.

**Project Type**: Web application (Next.js App Router monorepo, no
backend/frontend split).

**Performance Goals**:
- Home page first byte ≤ same as today (no extra SQL round-trips).
- One-tap log: ≤ 500 ms from tap → toast on a local Neon proxy
  connection.

**Constraints**:
- No new database round-trips on the home render path.
- No "dlužíš" or accusatory variants in any new Czech catalog
  string (user direction 2026-05-26).
- Reuse `logBeer` server action exactly as it is — no new
  consumption-creation pathway.
- Single Next.js server component for the home page; one client
  island (`HomeOneTapLog`) for the interactive button.

**Scale/Scope**: 1 club of ~20 members typical; the home page
renders once per app open per member. Out-of-scope dimensions
(multi-club, group logging) are explicitly deferred to other specs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Mobile-First PWA | ✓ PASS | One-tap-on-home is the most mobile-friendly version of the log flow. No desktop-only affordance. |
| II. Tenant-Aware Schema | ✓ PASS | Last-beer lookup MUST scope to the active club's catalog (FR-002). No cross-tenant leakage. |
| III. Track, Don't Transact | ✓ PASS | Reuses `logBeer` — no money flow change. |
| IV. Auth That Disappears | ✓ PASS | Home is behind the existing `requireUnlocked()` gate; no auth surface change. |
| V. Auditable History | ✓ PASS | One-tap writes a regular `consumptions` row; existing `voidConsumption` continues to apply (Edge Case: voided lookups). |
| VI. Free-Tier First | ✓ PASS | No new infrastructure. Existing Postgres + Vercel + sonner toast. |
| VII. Fresh Code Hygiene | ✓ PASS | No dep bumps required for this spec. |
| VIII. Testing Pyramid | ✓ PASS | See declaration below. |

### Test layer declaration *(required by Principle VIII)*

- **Unit (`pnpm test:unit`)** — N/A. This spec adds presentational
  + query code, no pure-function logic worth isolating. The label
  helper (e.g. "pick a CTA variant given beer + stock + archived")
  is small enough that its semantics are observable through
  component tests of the variants.
- **Integration (`pnpm test:integration`)** — **REQUIRED**.
  New `lastBeerForMember(memberId, clubId)` query helper: must
  return the most recent non-voided consumption's beer type
  joined with stock/archived flags, scoped to the active club,
  null when no consumption exists. Integration layer because the
  query is Drizzle + SQL — mocking it is test theatre (would
  replicate the SUT).
- **Component (`pnpm test:component`)** — **REQUIRED**.
  New `HomeOneTapLog` component must render correctly for the
  five variants:
  1. Active beer with stock → enabled button "Zapiš Pilsner".
  2. Active beer, `currentStock <= 0` → disabled with "nedostupné"
     hint + "Vyber jiné pivo →" fallback link.
  3. Archived last beer → generic "Zapiš pivo" linking to /log.
  4. No last beer (first-ever log) → generic "Zapiš pivo".
  5. Pending state (post-tap, pre-toast) → disabled button.
  Server actions stubbed via `vi.mock()`.
- **E2E (`pnpm test:e2e`)** — N/A. The journey (open app → tap CTA
  → consumption row created → balance updated) is mechanically
  the same as the existing `/log` flow, which has been verified
  through repeated manual use. No new server action, no new auth
  path, no new persistence shape — the seam this spec introduces
  is purely UI placement, which the component layer exercises.
  Spec 016's onboarding journey is the only true-E2E test in the
  repo and that bar (genuine multi-system seam) is not met here.

## Project Structure

### Documentation (this feature)

```text
specs/017-home-onetap-log/
├── spec.md             # /speckit-specify output (done)
├── plan.md             # this file
├── research.md         # /speckit-plan Phase 0 output
├── data-model.md       # /speckit-plan Phase 1 output
├── quickstart.md       # /speckit-plan Phase 1 output
├── contracts/
│   └── home-page.md    # UI contract: what / renders for each state
├── checklists/
│   └── requirements.md # already passed in /speckit-specify
└── tasks.md            # /speckit-tasks output (next phase)
```

### Source code (beeromat repo)

```text
app/[locale]/(app)/
├── page.tsx                  # MODIFIED — new layout (balance sentence + HomeOneTapLog +
│                              secondary settle CTA). Stays a Server Component.
└── log/
    └── actions.ts            # NO CHANGE — logBeer is reused as-is.

components/home/
└── home-one-tap-log.tsx      # NEW — client island. Props: { beer, locale, currency, balanceMinor }.
                              # Calls logBeer via a transition + sonner toast on success/failure.

lib/db/queries/
└── consumption.ts            # MODIFIED — adds lastBeerForMember(memberId, clubId).

messages/
├── cs.json                   # ADDS: home.* string additions (sentence variants,
│                              CTA labels, fallback hints, toast strings).
└── en.json                   # parallel adds.

tests/integration/
└── last-beer-for-member.spec.ts     # NEW — covers query semantics.

tests/component/
└── home-one-tap-log.spec.tsx        # NEW — covers the five render variants.
```

**Structure Decision**: This spec stays inside the existing Next.js
App Router layout. No new top-level directory. `components/home/`
is created if not present — small + focused, matches the
established `components/payments/`, `components/nav/`, etc. pattern.

## Phase plan

### Phase 0: Research

See [`research.md`](./research.md). Three decisions documented:

1. Query shape — fold last-beer lookup into the home query vs.
   separate helper.
2. Toast vs. inline confirmation — sonner with a 2 s auto-dismiss.
3. Client island scope — `HomeOneTapLog` only; the balance
   sentence stays server-rendered.

### Phase 1: Design & contracts

See [`data-model.md`](./data-model.md), [`contracts/home-page.md`](./contracts/home-page.md),
and [`quickstart.md`](./quickstart.md). No new entities; the
contract is a UI contract describing the home-page render
variants.

### Phase 2: Tasks

Output of `/speckit-tasks` — task breakdown by user story, with
component + integration test tasks for each.

## Complexity Tracking

No constitution gate violations. No new infrastructure. No new
dependencies. No principles bent. The spec is a refactor +
modest new query — the kind of work the constitution explicitly
calls cheap.
