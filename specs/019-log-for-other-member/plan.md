# Implementation Plan: Log a beer on behalf of another member

**Branch**: direct-to-`main` (trunk-based per constitution).
**Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Constitution**: v1.10.0

## Summary

Add a "Log for someone else" path that lets a present member log a
beer on behalf of an absent member of the same club. Reuses the
existing `logBeer` server action with `member_id` and
`created_by_user_id` decoupled (today they're always the same; the
schema already supports differing values). The absent member gets
proactive visibility via a new home review banner (modeled on
spec 018's `MatchBetModule`) and one-tap "Vrátit" to void the
consumption.

Spec also expands `/tab` to surface ALL four origin types of a
member's balance-affecting rows (self-logged / on-behalf /
won-bet / lost-bet) — the loser's view of bet-linked costs is
currently invisible on /tab today and only shows in the balance
total (this hurts Standa-style users who read line items, not
totals).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), constitution-pinned.

**Primary Dependencies**: Next.js 16.x App Router, Drizzle ORM
0.45.x, react-hook-form 7.76 + Zod, next-intl 4.x, sonner,
lucide-react. **No new deps.**

**Storage**: Existing Postgres. **One small schema addition**:
a new nullable timestamp column `consumptions.on_behalf_reviewed_at`
to mark when the consumer has dismissed the home review banner
for that row (per FR-005a). One Drizzle migration.

**Testing** (per Constitution v1.10.0 Principle VIII): see Test
Layer Declaration below.

**Target Platform**: Mobile-first PWA; modern Chrome/Safari/Edge.

**Project Type**: Web application (Next.js App Router monorepo).

**Performance Goals**:
- On-behalf log action: ≤ 500 ms server round-trip.
- Home render: ≤ 1 additional SQL query over the current path
  (folded into the existing `Promise.all` next to spec 018's
  `matchBetSummaryForMember`).
- `/tab` render: 1 query (extended), not N queries — the merged
  consumption + transfer row list comes from one extended
  query rather than two separate fetches.

**Constraints**:
- Constitution II: every new row carries `club_id`. Cross-club
  picker filter is non-negotiable.
- Constitution V: void path is the existing
  `voidConsumptionAction`; spec 019 doesn't create a new void
  path, it just adds the affordance.
- Czech wording: no "dlužíš". Working candidates:
  "Log for someone else" → "Zapsat pro jiného člena",
  "Pavel ti zapsal: Kozel" / "Vrátit",
  "z prohrané sázky".
- Reuse spec 017's `lastBeerForMember(absentMemberId, clubId)`
  as the beer-picker default (the absent member's last beer).

**Scale/Scope**: Small club ~20 members; on-behalf logs are
expected to be a minority of all logs.

## Constitution Check

*GATE: must pass before Phase 0; re-check after Phase 1.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Mobile-First PWA | ✓ PASS | New affordance is a tap-friendly link, member picker is a list. No desktop-only path. |
| II. Tenant-Aware Schema | ✓ PASS | Picker filters `members WHERE club_id = $1`. Consumption insert sets `club_id` (existing). Transfer queries filter by `club_id`. |
| III. Track, Don't Transact | ✓ PASS | No money flow change. |
| IV. Auth That Disappears | ✓ PASS | Reuses `requireUnlocked()` + existing role gate (member or above). |
| V. Auditable History | ✓ PASS | Reject reuses `voidConsumptionAction`'s atomic cascade. `created_by_user_id` preserved. |
| VI. Free-Tier First | ✓ PASS | No new infrastructure. |
| VII. Fresh Code Hygiene | ✓ PASS | No dep bumps. |
| VIII. Testing Pyramid | ✓ PASS | See declaration below. |

### Test layer declaration *(required by Principle VIII)*

- **Unit (`pnpm test:unit`)** — N/A. No new pure-function logic
  worth isolating. The variant-picker on `MemberTabEntry.kind`
  is observable via component tests.
- **Integration (`pnpm test:integration`)** — **REQUIRED**.
  Three new behaviours:
  1. `logBeerOnBehalfAction(beerTypeId, memberId)` creates a
     consumption with `member_id = absent`, `created_by_user_id
     = actor`. Edge: actor cannot pick themselves; actor must
     be in same club as target.
  2. `onBehalfReviewSummaryForMember(memberId, clubId)` returns
     count + array of {consumptionId, loggerName, beerName} for
     unreviewed on-behalf rows.
  3. `dismissOnBehalfReviewAction(consumptionId)` stamps
     `on_behalf_reviewed_at` for the row (does NOT void).
  4. Extended `getMyTabForSession` emits all four `kind` values:
     self-consumption, on-behalf-consumption (carries
     loggerDisplayName), transfer_in (bet-lost cost), transfer_out
     (rare — winner's offset). Total balance still consistent.
- **Component (`pnpm test:component`)** — **REQUIRED**.
  - New `<LogForOtherLink />` (home + /log surfaces).
  - New `<MemberPicker />` (the absent-member chooser).
  - New `<OnBehalfReviewBanner />` (home — modeled on spec 018's
    MatchBetModule).
  - Extended `/tab` row variant — four kinds × locale = 8 cases.
- **E2E (`pnpm test:e2e`)** — N/A. The journey "Pavel logs for
  Honza → Honza sees it → Honza rejects" crosses no new
  multi-system seams (reuses existing `requireUnlocked` + the
  existing void path). Integration + component layers cover it.

## Project Structure

### Documentation (this feature)

```text
specs/019-log-for-other-member/
├── spec.md              # /speckit-specify + /speckit-clarify (done)
├── plan.md              # this file
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — schema + entity reads/writes
├── quickstart.md        # Phase 1 — manual verification paths
├── contracts/
│   ├── log-on-behalf-tx.md   # action contract for the log path
│   └── review-banner.md      # UI contract for the home banner + tab rows
├── checklists/
│   └── requirements.md  # already passed
└── tasks.md             # /speckit-tasks output (next)
```

### Source code (beeromat repo)

```text
app/[locale]/(app)/
├── page.tsx                         # MODIFIED — render <OnBehalfReviewBanner />
│                                     above the existing <MatchBetModule />
│                                     and surface the "Log for someone else"
│                                     link below the one-tap button.
├── log/
│   ├── actions.ts                   # MODIFIED — new logBeerOnBehalfAction
│                                     (variant of logBeerAction that takes
│                                     a targetMemberId; reuses the same tx
│                                     internals).
│   └── page.tsx                     # MODIFIED — append "Log for someone
│                                     else" link at the bottom of the
│                                     catalog grid.
├── tab/
│   └── page.tsx                     # MODIFIED — render new entry-row
│                                     variants (transfer_in + on-behalf
│                                     subtitle).

components/log/
├── log-for-other-link.tsx           # NEW — small client link that
                                     navigates to the on-behalf flow page.
└── log-on-behalf-form.tsx           # NEW — the member-picker → beer-picker
                                     form (client component, uses
                                     spec-017's lastBeerForMember for the
                                     default).

app/[locale]/(app)/log/for/page.tsx  # NEW — the on-behalf flow page
                                     (reachable from both surfaces); renders
                                     <LogOnBehalfForm /> with the catalog
                                     + member list as props.

components/home/
└── on-behalf-review-banner.tsx      # NEW — passive notification banner on
                                     home (modeled on spec 018's
                                     MatchBetModule). One-tap "Vrátit" per
                                     row + bulk "Vrátit vše" if > 1.

lib/db/queries/
├── consumption.ts                   # MODIFIED — extend getMyTabForSession
                                     to merge bet_transfers into the entry
                                     list; add loggerDisplayName for
                                     on-behalf rows.
├── on-behalf-review.ts              # NEW — onBehalfReviewSummaryForMember,
                                     dismissOnBehalfReview helpers.
└── (lastBeerForMember reused as-is from spec 017)

lib/validation/log.ts                # MODIFIED (or new) — Zod schema for
                                     the new action; targetMemberId required,
                                     beerTypeId required.

drizzle/0010_on_behalf_reviewed_at.sql  # NEW migration — adds nullable
                                     timestamp column.

messages/
├── cs.json                          # ADDS: log.onBehalf.* + tab.fromMatch
│                                     reused + tab.fromBet (lost-bet
│                                     subtitle) + tab.byOther (on-behalf
│                                     subtitle).
└── en.json                          # parallel.

tests/integration/
├── log-on-behalf-tx.spec.ts         # NEW — covers the action + on-behalf
│                                     review summary + dismiss.
└── tab-entries-merged.spec.ts       # NEW — extended /tab query returns
                                     all four origin types in the right
                                     order, with correct attribution.

tests/component/
├── on-behalf-review-banner.spec.tsx # NEW — banner variants (empty / one
│                                     / many).
├── log-on-behalf-form.spec.tsx      # NEW — picker default behavior +
│                                     submit interaction.
└── tab-entry-row.spec.tsx           # NEW — four variant renders × locale.
```

**Structure Decision**: stays inside the existing App Router
layout. New `app/[locale]/(app)/log/for/page.tsx` is the
canonical on-behalf flow page (one URL for both home and /log
entry points). All new client components go under existing
`components/` subfolders.

## Phase plan

### Phase 0: Research

See [`research.md`](./research.md). Three decisions:

1. **`on_behalf_reviewed_at` column vs. separate `consumption_acks` table.**
   Decided: column on `consumptions`. Simpler, single query reads
   the review state; the data is 1-to-1 with the consumption.
2. **Single `logBeerOnBehalfAction` vs. extending `logBeerAction`
   with optional `targetMemberId`.** Decided: separate action.
   Cleaner authz boundary (the on-behalf path has slightly
   different validation — actor ≠ target, member-picker scope)
   and easier to test in isolation.
3. **`/tab` merged-entries query: extend existing OR new helper.**
   Decided: extend `getMyTabForSession`. Today it only emits
   `kind='consumption'`; the entry shape already includes the
   discriminator; transfers come from `bet_transfers` joined
   to `consumptions` for the beer-name lookup.

### Phase 1: Design & contracts

See [`data-model.md`](./data-model.md),
[`contracts/log-on-behalf-tx.md`](./contracts/log-on-behalf-tx.md),
[`contracts/review-banner.md`](./contracts/review-banner.md),
[`quickstart.md`](./quickstart.md).

### Phase 2: Tasks

Output of `/speckit-tasks` next.

## Complexity Tracking

No constitution gate violations. One schema migration (a single
nullable timestamp column) is the smallest possible schema change
and matches Constitution V's "soft-state extension is fine when
the column is opt-in / nullable" pattern. The /tab expansion is
honest — the loser's bet costs being invisible today was a real
under-spec'd corner of spec 018.
