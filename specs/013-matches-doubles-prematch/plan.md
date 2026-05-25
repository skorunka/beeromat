# Implementation Plan: Doubles + Pre-Match Agreement (v1.13)

**Branch**: `013-matches-doubles-prematch` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-matches-doubles-prematch/spec.md`

## Summary

v1.13 extends the spec-012 matches feature with two additions, both
locked-in by the `/speckit-clarify` session 2026-05-25:

1. **Doubles support** — 4-player 2v2 format, the club's default.
2. **Pre-match agreement** — a record of who's playing, on which
   side, and whether it's for beer, captured BEFORE the match. The
   post-match result then auto-fires 012's existing bet-transfer
   pipeline (when for-beer = yes) or stores the result only
   (when for-beer = no).

**Technical approach.** The existing 012 `matches` table stays
unchanged in shape; doubles results land as **two `matches` rows
sharing an `agreement_id`** (Q1 clarification), so the existing
match-history view + indexes light up doubles for free. Two new
tables capture agreement-only state: `match_agreements` (the
pre-match record + outcome + reversal metadata) and
`match_agreement_sides` (member-to-seat assignments). The doubles
pairing is encoded as a single 2-value enum (`straight` |
`crossed`) on the agreement row — the user's "explicit pick"
clarification (Q4) renders as a required choice with no default in
the UI. The legacy 012 one-step singles log UI is sunset on ship
(Q5); new singles go through the same agreement flow with a
fast-create-then-record back-to-back path. The `/match` route
reshapes into a hub (Q3): "Upcoming" list at top, "New match"
below. Result-recording is gated to match participants + treasurer
override (Q2) at both the action and UI layers (CTA hidden for
non-participants).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict mode), constitution
v1.7.0 pin.

**Primary Dependencies**: Next.js 16.x (App Router + Server
Actions), React 19.2.x, Drizzle ORM 0.45.x + Drizzle Kit 0.31.x,
`@neondatabase/serverless` 1.x (WebSocket pool variant for
interactive transactions), Better Auth v1.x, next-intl,
react-hook-form 7.76 + `@hookform/resolvers` 5.4 + Zod 4.x,
Tailwind 4.3.x, shadcn/ui (`new-york` style), Base UI for select /
dropdown primitives, `sonner` for toasts.

**Storage**: Neon Postgres via the serverless driver (production)
or `local-neon-http-proxy` (dev / test). Three schema additions:
new tables `match_agreements` + `match_agreement_sides`; nullable
`agreement_id` column on existing `matches`. No data migration of
historical 012 rows — they keep `agreement_id = NULL` (per FR-017).

**Testing**: Vitest for unit + transaction-level tests against
PGlite; Playwright for E2E against the production build on an
isolated test DB (`beeromat_test` via the test neon proxy on host
port 14445). Every Acceptance Scenario in `spec.md` gets a
matching Playwright assertion per constitution gate 5.

**Target Platform**: Mobile-first PWA (one-thumb operation, no
service worker). Desktop browsers supported for operational roles
(treasurer overrides). No native packaging.

**Project Type**: Next.js full-stack web app (App Router, Server
Actions, no separate backend).

**Performance Goals**:

- Agreement creation form submission → toast in < 500 ms (P95).
- Result-record action → settlement toast in < 2 s end-to-end
  (SC-002 in spec); matches the 012 baseline.
- Upcoming-agreements list query on `/match` < 100 ms server-side.

**Constraints**:

- Free-tier hosting (Vercel + Neon + Resend + Cloudflare).
- Magic-link auth + device PIN already in place; 013 inherits.
- All seven verification gates must pass (typecheck, lint, unit,
  build, E2E, i18n, forms).
- Reuse existing `betTransfers` / `betTransferVoids` schemas;
  013 does NOT introduce a new settlement mechanic.

**Scale/Scope**: Single club, ~20 active members, dozens of
matches per month at the high end. No scale concerns for v1.13.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I — Mobile-First PWA | `/match` hub, agreement create, result record all one-thumb on phone | ✅ |
| II — Tenant-Aware Schema, Single-Club UX | `match_agreements.club_id` FK; no club switcher; agreement-only state lives in DB (not env) | ✅ |
| III — Track, Don't Transact | No money APIs; settlement reuses existing `betTransfers` ledger; no new payment rail | ✅ |
| IV — Auth & Bots | No auth changes; result-record gate uses existing `requireUnlocked()` + role check | ✅ |
| V — Auditable History | Agreement insert is append-only (`created_at` + `created_by_user_id`); result reversal writes a `voided_at` row, never UPDATEs history; reversibility surfaced in UI per the v1.4 clause | ✅ |
| VI — Free-Tier First | Schema additions are 1 enum + 2 tables + 1 column — well within Neon's 0.5 GB free tier | ✅ |
| VII — Fresh Code Hygiene | No new top-level deps; existing `lockfile ≡ Tech Stack table` invariant preserved | ✅ |

### Special rules (constitution v1.4+)

- **Verifiable Tasks**: every task generated in `/speckit-tasks`
  will be backed by either a verification gate or an Acceptance
  Scenario in the spec. No hope-tasks.
- **Personas as spec input**: ✅ — Personas P1 (Pavel), P2 (Standa),
  P3 (Tereza) in spec.md, each cited by user stories.
- **Verification infrastructure**: ✅ existing — Playwright + test
  DB + Mailpit + Turnstile test keys all live from spec 001+.
- **Test/Prod Code Separation**: hard rule enforced. No
  `if (NODE_ENV === 'test')` branches will be introduced in 013's
  production source. Test-only state lives under `tests/`.
- **User Input & Forms**: new forms (create-agreement,
  record-result) MUST use `react-hook-form` + Zod resolver with
  in-app error rendering; no native `required` / `pattern`; date
  pickers (if any) via `react-day-picker`. `forms:check` gate
  enforces.
- **i18n**: every user-facing string lives in `messages/cs.json` +
  `messages/en.json`; `i18n:check` gate enforces parity.

**Result**: zero violations. Complexity Tracking table left empty.

### Phase 1 re-evaluation (post-design)

After authoring `data-model.md` + `contracts/match-agreements.md`,
re-running the gate table:

- All 7 principles still ✅.
- One nuance worth documenting under V (Auditable History): the
  `reverseResultAction` UPDATEs the agreement to set `reversed_at`
  (compensating) AND nulls `result_recorded_at` (soft-state
  restoration so the agreement returns to OPEN per US1.3). The
  underlying historical events (`matches` rows, `bet_transfers`)
  are NEVER rewritten — they get voided via the same compensating
  pattern 012 already uses (`voidedAt` + `bet_transfer_voids`).
  The agreement table is the stateful soft-object; the matches /
  transfers tables remain append-only. This is consistent with
  012's existing pattern (which UPDATEs `voidedAt` on `matches`
  rows) and the constitution's intent ("no silent history
  rewrites" rather than "no UPDATEs ever"). Documented in
  data-model.md state-transitions section.

No new violations surfaced; no Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/013-matches-doubles-prematch/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Spec + 5 clarifications integrated
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/
│   └── match-agreements.md   # Server Action contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (already in place)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

This is an existing Next.js 16 App Router project. 013's changes
land in the established directories — no new top-level structure.

```text
beeromat/
├── app/[locale]/(app)/match/        # Existing 012 route — reshaped + extended
│   ├── page.tsx                     # MODIFY: hub layout (Upcoming + New match)
│   ├── MatchForm.tsx                # DELETE: legacy 012 quick-log UI sunset (per FR-017)
│   ├── actions.ts                   # MODIFY: new server actions (create/edit/cancel agreement, record result); legacy logMatchAction removed
│   ├── NewMatchAgreementForm.tsx    # NEW: create-agreement form (format + lineup + pairing + for-beer)
│   ├── UpcomingAgreementsList.tsx   # NEW: server component listing open agreements
│   └── [agreementId]/
│       ├── page.tsx                 # NEW: agreement detail / record-result view
│       ├── RecordResultForm.tsx     # NEW: record result + undo client component
│       └── EditAgreementForm.tsx    # NEW: edit before result
├── lib/db/schema/
│   └── matches.ts                   # MODIFY: add agreement_id col + new match_agreements + match_agreement_sides tables + matchFormat / matchPairingKind enums
├── lib/db/queries/
│   ├── matches.ts                   # MODIFY: extend logMatch helpers for the agreement→matches mapping; void helpers stay
│   └── match-agreements.ts          # NEW: create/edit/cancel/record/reverse + upcoming-list queries
├── lib/validation/
│   ├── match.ts                     # MODIFY or DELETE: legacy logMatchSchema goes with the legacy UI
│   └── match-agreement.ts           # NEW: Zod schemas for create/edit/record/cancel
├── lib/auth/session.ts              # MODIFY: ensure requireRole / participant-check helper available (or add)
├── messages/
│   ├── cs.json                      # MODIFY: extend match.* namespace (agreement, pairing, upcoming, record, recovery copy)
│   └── en.json                      # MODIFY: mirror cs.json keys
├── drizzle/
│   └── NNNN_…sql                    # NEW: migration adding columns + tables + enums
└── tests/
    ├── unit/
    │   ├── match-agreement-tx.spec.ts       # NEW: agreement create/edit/record/reverse against PGlite
    │   └── match-agreement-schema.spec.ts   # NEW: Zod schema cases
    └── e2e/
        ├── match-agreement.spec.ts          # NEW: US1+US2+US3+US4 Playwright scenarios
        └── match.spec.ts                    # MODIFY or DELETE: legacy 012 tests pruned where they covered the sunset UI
```

**Structure Decision**: standard Next.js App Router conventions
already used by specs 001-012. No new build / test infrastructure.
New code lives alongside existing modules so the import-graph stays
flat and discoverable.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
