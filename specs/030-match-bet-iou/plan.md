# Implementation Plan: Deferred match-bet settlement (beer IOU)

**Branch**: `main` (trunk-based) | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-match-bet-iou/spec.md`

## Summary

Stop auto-settling for-beer matches at result-record time. Instead, recording a
result creates a **pending beer-debt** ("IOU") per losing↔winning pair, visible to
both members, that moves no money or stock. The beer the match is for is chosen at
**match-create** (new picker, stored on the agreement) and is the IOU's default.
When the beer is physically handed over, **either party** taps "Předáno", confirms
or overrides the beer, and only then is the cost booked to the loser's tab — reusing
the existing consumption + bet-transfer settlement so all balance/tab/breakdown
figures stay consistent. The separate casual "take someone's drink" surface is
removed. Result wording becomes "Vítěz:" / "Vítězové:".

Technical approach: add `match_agreements.bet_beer_type_id` (the planned beer) and a
new `match_bet_debts` table (pending → settled/voided). `recordResultTx` creates
`matches` rows (history, unchanged) + pending debts (when `forBeer`) and **stops**
creating consumptions/transfers. A new `deliverBeerDebtTx` runs the existing
`settleOnePair` logic from a debt and flips it to settled. Cancel/reverse voids
pending debts (no money) or, if already settled, voids the transfer via the existing
path. The result-time bet-beer tile picker (spec 025) and the casual-bet action
(`app/[locale]/(app)/bet/actions.ts`) are removed.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict)

**Primary Dependencies**: Next.js 16 (App Router, Turbopack), React 19.2, Drizzle ORM 0.45.x + Drizzle Kit 0.31.x, `@neondatabase/serverless`, next-intl 4, Tailwind 4, base-ui/shadcn, react-hook-form + zod, sonner.

**Storage**: Neon Postgres (PGlite in integration tests). New table `match_bet_debts` + one column on `match_agreements`.

**Testing**: Vitest (unit `tests/unit/`, integration+PGlite `tests/integration/`, component+RTL/jsdom `tests/component/`). No Playwright (rig not in repo).

**Target Platform**: Mobile-first PWA; desktop for admin roles.

**Project Type**: Web app (Next.js single project).

**Performance Goals**: Standard mobile web; pending-IOU queries are small per-member lists with covering indexes.

**Constraints**: Club-scoped data (Principle II); auditable, no hard deletes (Principle V); balance/tab invariant preserved; Czech-first i18n; no native dialogs/inputs.

**Scale/Scope**: ~1 club, dozens of members; a handful of open IOUs at a time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. All new surfaces (IOU rows, deliver control, create-form beer picker) are mobile-first, one-thumb, big tap targets; no desktop-only step.
- **II. Tenant-Aware Schema** — PASS. `match_bet_debts` carries `club_id`; every read/write is club-scoped; the deliver action re-validates the actor, beer availability, and stock server-side (never trusts client picks).
- **III. Track, Don't Transact** — PASS. No money movement; delivery records a consumption + transfer exactly as today, just deferred.
- **IV. Auth** — PASS. Reuses existing session/role gates; deliver requires an authenticated club member (participant or treasurer+).
- **V. Auditable History (no hard deletes)** — PASS. Debts use **status transitions** (pending → settled/voided) with audit fields; a reversed-while-pending debt is marked `voided` (compensating state), never `DELETE`d. The settled-transfer reversal uses the existing `bet_transfer_voids` path. Reversibility is exposed in the UI (deliver + the existing match reverse).
- **VI. Free-Tier First** — PASS. No new infra.
- **VII. Fresh Code Hygiene** — PASS. No dependency changes.
- **VIII. Testing Pyramid** — PASS with the declaration below.

### Test layer declaration

- **Unit (`pnpm test:unit`)** — Pure helpers only: the singular/plural winner-name formatter ("Vítěz:" vs "Vítězové:"), and any pure debt-status/direction predicate (e.g. "is this debt actionable by member X", "label for owed-vs-owing"). No DB.
- **Integration (`pnpm test:integration`)** — The core of this feature. `recordResultTx` (for-beer → creates N pending debts, zero consumptions/transfers/stock change; friendly → no debt; history `matches` rows still written); `deliverBeerDebtTx` (books exactly one beer's cost to the loser, decrements stock, links + flips to settled; idempotent — second attempt is a no-op, no double-charge; override beer respected; out-of-stock rejected); reverse/cancel while pending (debts voided, no money) and after settlement (transfer voided via existing path); the balance/tab invariant after delivery (`effectiveConsumptionTotal` == Σ countable entries). Migrate existing record-result/match integration tests to the deferred model.
- **Component (`pnpm test:component`)** — The new IOU UI: home match-bet module (winner sees "Dluží ti pivo", loser sees "Dlužíš pivo", correct Vítěz/Vítězové), the match-hub "Sázky k vyrovnání" list, the deliver control (pre-filled beer, override, close-on-select, disabled-while-pending), and the create-form beer picker (shown only for forBeer, close-on-select). Mock actions with `vi.mock()`.
- **E2E (`pnpm test:e2e`)** — **N/A.** The Playwright rig was removed from the repo on 2026-05-26 and is dormant (Principle VIII: the E2E gate runs only when a plan declares coverage *and* the rig exists). Current project practice (specs 026–029) ships integration + component without E2E, prioritising dev velocity for this pet app. The journey seams here are DB transactions (covered by integration at the authoritative boundary) and server-action wiring (covered by component tests with mocked actions). Reinstating Playwright for one journey is out of scope for 030; a future crucial-journey E2E spec can add a "win a match → settle the IOU" path.

## Project Structure

### Documentation (this feature)

```text
specs/030-match-bet-iou/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — match_bet_debts + agreement column
├── quickstart.md        # Phase 1 — manual walkthrough
├── contracts/           # Phase 1 — action/query contracts
│   └── beer-iou.md
└── tasks.md             # Phase 2 — /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
lib/db/schema/
├── matches.ts                 # + bet_beer_type_id on match_agreements
└── match-bet-debts.ts         # NEW — match_bet_debts table

drizzle/                       # NEW migration (generated via drizzle-kit)

lib/db/queries/
├── match-agreements.ts        # createAgreementTx (+beer), recordResultTx (→ pending debts, no settle), deliverBeerDebtTx (NEW), reverse/cancel (void debts)
└── match-bet-debts.ts         # NEW — listBeerDebtsForMember (both directions, pending), debt detail

lib/match/
├── default-bet-beer.ts        # reused at delivery (override → planned → fallback)
└── winner-label.ts            # NEW pure helper — Vítěz/Vítězové formatting

app/[locale]/(app)/match/
├── NewMatchAgreementForm.tsx  # + BeerPickerDropdown when forBeer
├── actions.ts                 # createAgreementAction (+beer), deliverBeerDebtAction (NEW); remove casual createBetTransferAction usage
├── page.tsx                   # remove casual box; render "Sázky k vyrovnání" (pending IOUs)
├── BetSettleSection.tsx       # REPLACE casual section with IOU list (or new component)
├── [agreementId]/page.tsx     # Vítěz/Vítězové heading
└── [agreementId]/RecordResultForm.tsx  # remove bet-beer tile picker (beer now from create/delivery); record no longer settles

app/[locale]/(app)/bet/        # REMOVE casual action (actions.ts createBetTransferAction)
components/bet/transfer-list.tsx  # REMOVE casual "drinks you can take" UI (or repurpose)

components/home/
├── match-bet-module.tsx       # show pending IOUs (both roles) + deliver entry; Vítěz/Vítězové
components/match/
└── beer-iou-row.tsx           # NEW — one IOU row + deliver control (shared home + match hub)

lib/db/queries/match-bet-summary.ts  # pending-IOU summary for home (replaces won/lost transfer counts)

messages/cs.json, messages/en.json   # new IOU strings; remove casual bet.* strings
```

**Structure Decision**: Single Next.js project (existing layout). New DB artifacts mirror the existing `lib/db/schema` + `lib/db/queries` split; a new shared `beer-iou-row` component serves both home and the match hub; pure formatting lives in `lib/match/`.

## Complexity Tracking

No Constitution violations to justify. The one notable deviation — **no E2E test** — is explicitly permitted by Principle VIII (the gate is conditional and the rig is dormant) and is justified in the Test layer declaration above, not a waiver.
