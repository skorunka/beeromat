# Implementation Plan: Match-bet → home awareness

**Branch**: direct-to-`main` (trunk-based per constitution).
**Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Constitution**: v1.10.0

## Summary

When a "for beer" match settles, the system auto-creates the
bet-linked consumption rows on the winner side and the
bet_transfer rows that move the cost to the loser side — all in
the same atomic transaction that records the match. The loser's
home (per spec 017's layout) surfaces a passive notification
with a visible undo. The treasurer can audit + reverse via the
existing match-void path.

Three things change in the codebase:

1. **`settleOnePair` semantics flip** from "find an existing
   winner consumption and transfer it" → "create the winner's
   consumption (from default beer with optional override) and
   transfer it". This is the spec's core behavior change.
2. **`clubs.matchLoserBeerCount` becomes live** (it's been a
   dead schema column with default 1 since spec 013). The new
   `settleOnePair` reads it and splits across pairs per the
   clarify rule.
3. **A new home module** ("útrata z dnešního zápasu: 2× pivo")
   slots into the spec-017 page above the one-tap-log button
   whenever the loser has bet-linked consumption in the current
   open session.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), constitution-pinned.

**Primary Dependencies**: Next.js 16.x App Router, Drizzle ORM
0.45.x, react-hook-form 7.76 + Zod, next-intl 4.x, sonner,
lucide-react. No new deps.

**Storage**: existing Postgres. **No new tables, no new
columns.** The bet-linked back-reference already exists via
`bet_transfers.source_consumption_id` + `match_bet_transfers`.

**Testing**: per Constitution v1.10.0 Principle VIII — see Test
Layer Declaration below.

**Target Platform**: same as spec 017 — mobile-first PWA, modern
phones first.

**Project Type**: Web application (Next.js App Router monorepo).

**Performance Goals**:
- Home render: ≤ 1 additional SQL query over spec 017's path
  (the new "open bet-linked consumption for this member"
  lookup) — query folds into existing parallel `Promise.all`.
- Match-settle action: completes in the same transaction
  envelope as today; +N INSERTs (one consumption + one
  transfer per beer in the bet).

**Constraints**:
- Constitution V: voids cascade atomically across match →
  transfer → consumption.
- Constitution II: every new row carries `club_id`. Queries
  filter by `club_id`.
- Constitution Forms: result-recording UI's new beer-picker
  follows the established react-hook-form + Zod pattern; no
  native dropdowns.
- Czech wording: no `dlužíš` in any new string. Working
  candidate: `"Útrata z dnešního zápasu: {count}× pivo"`.

**Scale/Scope**: Same as the rest of the app — single club ~20
members, dozens of matches per month at most.

## Constitution Check

*GATE: must pass before Phase 0; re-check after Phase 1.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Mobile-First PWA | ✓ PASS | Loser sees obligation on home — most mobile-friendly placement. No desktop-only path. |
| II. Tenant-Aware Schema | ✓ PASS | All new rows (consumptions, bet_transfers, match_bet_transfers) already carry `club_id`. Queries filter on it. |
| III. Track, Don't Transact | ✓ PASS | No money flow change. The bet is bookkeeping. |
| IV. Auth That Disappears | ✓ PASS | Reuses existing `requireUnlocked()` + the existing match-recording authz (only participants + treasurer-and-above per FR-007 of spec 013). |
| V. Auditable History | ✓ PASS | Auto-created rows go through the same insert path as `logBeer`; voids cascade atomically per FR-005. No hard deletes. |
| VI. Free-Tier First | ✓ PASS | No new infra. |
| VII. Fresh Code Hygiene | ✓ PASS | No dep bumps required. |
| VIII. Testing Pyramid | ✓ PASS | See declaration below. |

### Test layer declaration *(required by Principle VIII)*

- **Unit (`pnpm test:unit`)** — REQUIRED.
  The doubles-split helper (`splitBeerCountAcrossPairs(count,
  numPairs)`) is pure arithmetic with edge cases (rounding up,
  zero leftovers, count > pairs). Unit-test it; no DB needed.
- **Integration (`pnpm test:integration`)** — REQUIRED.
  The match-settle transaction's new behavior is the meat of
  the spec. Cases:
  1. Singles, for-beer, default beer = winner's last-beer →
     1 consumption + 1 transfer + 1 match_bet_transfer.
  2. Singles, for-beer, winner has no last-beer → fallback to
     cheapest in-stock; rows still created.
  3. Singles, for-beer, no in-stock beer at all → action
     fails loudly.
  4. Doubles straight pairing, count=2 → 1 + 1 split.
  5. Doubles straight pairing, count=3 → 2 + 1 split (seat1
     pair gets the extra).
  6. Override beer chosen by recorder → that beer's row is
     created, not the default.
  7. No open session → action opens one (reusing logBeer's
     auto-open path).
  8. Match-void cascade: all 3 row types void atomically;
     loser's balance returns to pre-match value.
- **Component (`pnpm test:component`)** — REQUIRED.
  Two new components: (a) the home `MatchBetModule` (passive
  notification with undo), and (b) the result-recording UI's
  optional beer-picker. Mocked server actions via `vi.mock()`.
- **E2E (`pnpm test:e2e`)** — N/A. The chain (record result →
  rows created → home renders) crosses well-tested seams
  individually: `recordResultTx` integration coverage above,
  home render covered by spec-017's component layer + the new
  `MatchBetModule` component test. Spec 016's true-E2E is
  reserved for journey spines whose value is only end-to-end
  (auth + persistence + browser nav); this spec doesn't
  introduce a new such seam.

## Project Structure

### Documentation (this feature)

```text
specs/018-match-bet-home-awareness/
├── spec.md              # /speckit-specify + /speckit-clarify output (done)
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no new entities; documents the reuse)
├── quickstart.md        # Phase 1 output (manual verification paths)
├── contracts/
│   ├── settle-tx.md     # match-settle transaction contract
│   └── home-module.md   # UI contract for the new home module
├── checklists/
│   └── requirements.md  # already passed
└── tasks.md             # /speckit-tasks output (next phase)
```

### Source code (beeromat repo)

```text
app/[locale]/(app)/match/
├── actions.ts                          # MODIFIED — recordResultAction accepts the
│                                        override beerTypeId; reuses existing authz path.
└── [agreementId]/
    └── RecordResultForm.tsx            # MODIFIED — adds the optional beer-picker.

lib/db/queries/
├── match-agreements.ts                 # MODIFIED — settleOnePair flips from
│                                        "find existing" to "auto-create"; doubles split
│                                        helper called here; reads club.matchLoserBeerCount.
└── consumption.ts                      # NO CHANGE — lastBeerForMember reused as-is.

lib/match/
├── split-beer-count.ts                 # NEW — pure helper for the doubles split rule.
│                                        Unit-testable in isolation.
└── default-bet-beer.ts                 # NEW — pure helper that picks the beer (last-beer
                                        → cheapest in-stock → throw). Consumes a snapshot
                                        of catalog rows; doesn't query the DB itself.

lib/db/queries/
└── match-bet-summary.ts                # NEW — query: "for this member in the current
                                        open session, how many bet-linked unvoided
                                        consumptions exist + the source match(es)."
                                        Folded into the home page query path.

components/home/
└── match-bet-module.tsx                # NEW — passive notification row with undo.

app/[locale]/(app)/page.tsx             # MODIFIED — renders <MatchBetModule /> above
                                        the one-tap log button when the lookup returns
                                        non-empty.

lib/validation/match-agreement.ts       # MODIFIED — recordResultSchema gains optional
                                        `beerTypeId` override field.

messages/
├── cs.json                             # ADDS: match.bet.* string additions.
└── en.json                             # parallel.

tests/unit/
└── split-beer-count.spec.ts            # NEW — pure function unit tests.

tests/integration/
└── match-settle-with-bet.spec.ts       # NEW — covers the 8 transaction cases above.

tests/component/
├── match-bet-module.spec.tsx           # NEW — home module render variants.
└── record-result-beer-picker.spec.tsx  # NEW — picker default + override behavior.
```

**Structure Decision**: stays inside the existing Next.js App
Router layout. New helpers go under `lib/match/` (a new tiny
namespace, but justified — match-related domain logic that's
NOT a DB query). `components/home/` already exists (spec 017).

## Phase plan

### Phase 0: Research

See [`research.md`](./research.md). Three decisions documented:

1. Beer-default resolution order (last-beer → cheapest in-stock →
   fail loudly), with the override path.
2. Doubles split — `count` per losing side, even with rounding
   up; seat1's pair gets the leftover.
3. Whether to keep the existing "find existing winner consumption
   and transfer" path as a fallback OR fully replace it.
   **Decision: fully replace.** Today's "best-effort" path can
   leave `transferredCount < requestedCount`, which is exactly
   the gap spec 018 is closing.

### Phase 1: Design & contracts

See [`data-model.md`](./data-model.md),
[`contracts/settle-tx.md`](./contracts/settle-tx.md),
[`contracts/home-module.md`](./contracts/home-module.md),
[`quickstart.md`](./quickstart.md).

No new entities; the contracts document the new behavior of an
existing transaction (`recordResultTx` → `settleOnePair`) and
the new UI contract for the home module.

### Phase 2: Tasks

Output of `/speckit-tasks` next.

## Complexity Tracking

No constitution gate violations. The "no new tables, no new
columns" property + the test layer split (unit + integration +
component) keep the spec inside the existing complexity
envelope. The only real behavior change is `settleOnePair`'s
mode — from passive (find-existing) to active (auto-create) —
which is a deliberate fix of an under-spec'd corner of spec 013.
