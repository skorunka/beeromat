# Data Model: Doubles + Pre-Match Agreement (v1.13)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

## Overview

Two new tables + one new column on the existing `matches` table.
Two new enums. No data migration of historical 012 rows.

```text
match_agreements (new)
  ↓ 1..N
match_agreement_sides (new)         ↓ 0..N (back-pointer)
                                   matches (existing 012)
                                     ↓ 0..N
                                   match_bet_transfers (existing 012)
                                     ↓ 1..1
                                   bet_transfers (existing 001)
```

## New Enums

### `match_format`

```sql
CREATE TYPE match_format AS ENUM ('singles', 'doubles');
```

| Value | Meaning |
|---|---|
| `singles` | 1v1 — 2 sides, 1 seat each |
| `doubles` | 2v2 — 2 sides, 2 seats each. Default. |

### `match_pairing_kind`

```sql
CREATE TYPE match_pairing_kind AS ENUM ('straight', 'crossed');
```

| Value | Meaning |
|---|---|
| `straight` | Side A seat 1 ↔ side B seat 1; side A seat 2 ↔ side B seat 2 |
| `crossed` | Side A seat 1 ↔ side B seat 2; side A seat 2 ↔ side B seat 1 |

Only applies to doubles. Singles agreements set this to NULL.

## New Tables

### `match_agreements`

The pre-match record. One row per agreed-upon match.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs(id) ON DELETE RESTRICT` | Tenant scope (constitution II). |
| `format` | `match_format` | NOT NULL | `singles` or `doubles`. |
| `for_beer` | `boolean` | NOT NULL | The yes/no flag from FR-005. |
| `pairing_kind` | `match_pairing_kind` | NULLABLE | NOT NULL when `format = 'doubles'`; NULL when `format = 'singles'`. Enforced via CHECK constraint. |
| `winning_side` | `text` | NULLABLE, CHECK `IN ('A', 'B')` | NULL until result is recorded. |
| `result_recorded_at` | `timestamptz` | NULLABLE | NULL until result is recorded. |
| `result_recorded_by_user_id` | `uuid` | NULLABLE, FK → `users(id) ON DELETE SET NULL` | Auditor for the result-recording action. NULL until recorded. |
| `reversed_at` | `timestamptz` | NULLABLE | Set when an undo within the 5-min window reverses a recorded result. Pairs the agreement back to "open" state. |
| `reversed_by_user_id` | `uuid` | NULLABLE, FK → `users(id) ON DELETE SET NULL` | Auditor for reversal. |
| `cancelled_at` | `timestamptz` | NULLABLE | Set when an open agreement is cancelled before any result. |
| `cancelled_by_user_id` | `uuid` | NULLABLE, FK → `users(id) ON DELETE SET NULL` | Auditor for cancellation. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users(id) ON DELETE RESTRICT` | |

**CHECK constraints**:

- `chk_match_agreements_pairing_when_doubles`: `(format = 'doubles' AND pairing_kind IS NOT NULL) OR (format = 'singles' AND pairing_kind IS NULL)`.
- `chk_match_agreements_result_or_reversal_or_cancellation`: at most one terminal state at a time — `cancelled_at IS NULL OR (result_recorded_at IS NULL AND reversed_at IS NULL)`.

**Indexes**:

- `idx_match_agreements_club_open` on `(club_id, created_at DESC) WHERE result_recorded_at IS NULL AND cancelled_at IS NULL` — drives the UpcomingAgreementsList query.
- `idx_match_agreements_club_recorded` on `(club_id, result_recorded_at DESC) WHERE result_recorded_at IS NOT NULL` — drives the "recently settled" view (also feeds history aggregation joining with `matches`).

### `match_agreement_sides`

Member-to-seat assignments for each agreement.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `agreement_id` | `uuid` | NOT NULL, FK → `match_agreements(id) ON DELETE RESTRICT` | |
| `side` | `text` | NOT NULL, CHECK `IN ('A', 'B')` | |
| `seat` | `int2` | NOT NULL, CHECK `IN (1, 2)` | Always 1 for singles; 1 or 2 for doubles. |
| `member_id` | `uuid` | NOT NULL, FK → `members(id) ON DELETE RESTRICT` | The seated player. |

**Composite PK**: `(agreement_id, side, seat)`.

**Constraints**:

- `chk_match_agreement_sides_singles_seat_one`: not enforceable via CHECK alone; enforced in the `createAgreementAction` validation layer + in the seed assertion of unit tests: singles agreements MUST have exactly 2 rows in this table, both with `seat = 1` (one per side). Doubles agreements MUST have exactly 4 rows: side A seats 1+2, side B seats 1+2.
- `uq_match_agreement_sides_distinct_members`: a UNIQUE constraint on `(agreement_id, member_id)` ensures the same member cannot occupy two seats in one agreement (the FR-014 same-member-twice rejection rule).

**Indexes**:

- `idx_match_agreement_sides_agreement` on `(agreement_id)` — drives the "load all 2/4 players for one agreement" join.
- `idx_match_agreement_sides_member_open` on `(member_id) WHERE TRUE` — drives the "matches the viewer is participating in" filter; supplemented by an agreement-state join.

## Modified Tables

### `matches` (existing 012 — additive column only)

Add one column. No other shape changes.

| Column added | Type | Constraints | Notes |
|---|---|---|---|
| `agreement_id` | `uuid` | NULLABLE, FK → `match_agreements(id) ON DELETE RESTRICT` | Back-pointer to the agreement that produced this row. NULL for historical 012 one-step singles rows. NON-NULL for all rows created by 013's record-result path. |

**Index added**:

- `idx_matches_agreement` on `(agreement_id)` — drives the
  "list match rows for an agreement" query (used during undo
  and in the doubles history-detail view).

**Doubles → matches row mapping** (worked example):

Agreement with `format = 'doubles'`, `pairing_kind = 'straight'`,
side A = (Pavel seat 1, Tereza seat 2), side B = (Standa seat 1,
Karel seat 2). Side B wins. The `recordResultTx` helper inserts
two `matches` rows under one transaction:

| `winner_member_id` | `loser_member_id` | `agreement_id` |
|---|---|---|
| Standa (B1) | Pavel (A1) | `<agreement>` |
| Karel (B2) | Tereza (A2) | `<agreement>` |

For `pairing_kind = 'crossed'`: Standa ↔ Tereza, Karel ↔ Pavel.

Singles: one row per agreement, the existing 012 model.

## State Transitions

### `match_agreements` lifecycle

```text
                  ┌──── cancelled_at set ────→ CANCELLED (terminal)
                  │
   OPEN ──────────┤
   (created)      │
                  │
                  └── result_recorded_at set ──→ RECORDED
                                                    │
                                                    │  ←─ within 5-min undo window
                                                    │     reversed_at set, result_recorded_at = NULL
                                                    │
                                                    └──→ OPEN again (idempotent return)
                                                         OR remains RECORDED past window (terminal)
```

States, encoded as a derived view on the columns:

- **OPEN**: `result_recorded_at IS NULL AND cancelled_at IS NULL`.
  Listed in UpcomingAgreementsList. Editable, cancellable, ready
  for result-record.
- **RECORDED**: `result_recorded_at IS NOT NULL AND reversed_at IS NULL`.
  Hidden from upcoming-list, shown in history. Editable only via
  undo within 5 minutes (writes `reversed_at`, nulls out
  `result_recorded_at`).
- **CANCELLED**: `cancelled_at IS NOT NULL`. Hidden everywhere
  except an admin "view all" report (not in v1.13 scope).

### Compensating-row pattern (constitution V)

013 follows the same pattern as 012:

- Agreement insert / cancellation / result-recording / reversal all
  add or set columns; NEVER UPDATE → wipe to a different state.
- The 5-min undo writes `reversed_at` (and sets
  `result_recorded_at = NULL` as the compensating change required
  to return the agreement to OPEN state — this is the one
  exception, allowed because the column is itself a soft-state
  marker, not historical content; the `reversed_at` trail records
  WHEN this happened and WHO did it).
- The `matches` rows created for a RECORDED doubles result are
  themselves voided (existing 012 `voidedAt` columns) when the
  agreement is reversed. Their corresponding `match_bet_transfer`
  links + `bet_transfer_voids` rows are written under the same
  transaction (same code path as 012's `voidMatchTx`).

## Derived data (no storage)

- **Participant set for an agreement**: `SELECT member_id FROM
  match_agreement_sides WHERE agreement_id = ?` (used by the R3
  authorization guard).
- **"Open agreements for member X"**: join `match_agreements ⨝
  match_agreement_sides` on `(agreement_id, member_id = X) WHERE
  result_recorded_at IS NULL AND cancelled_at IS NULL`.

## Validation rules (enforced in `lib/validation/match-agreement.ts`)

| Rule | Source |
|---|---|
| Format must be `'singles'` or `'doubles'` | FR-001 |
| Singles: exactly 2 distinct member_ids, one per side, both with `seat = 1` | FR-004, FR-014 |
| Doubles: exactly 4 distinct member_ids, two per side (seats 1+2 each), pairing_kind required | FR-003, FR-006, FR-014 |
| All member_ids must belong to the same club as the agreement | FR-001, constitution II |
| For-beer flag is required (no implicit default) | FR-005 |
| Winning side (on record action) must be `'A'` or `'B'` | FR-008 |
| Recorder must be in the participant set OR have role ≥ `treasurer` | FR-007 |
| Reversal allowed only within 5 minutes of `result_recorded_at` | FR-010 |
| Edit / cancel blocked when `result_recorded_at IS NOT NULL AND reversed_at IS NULL` | FR-013 |

## Schema TypeScript types (preview)

These will live in `lib/db/schema/matches.ts` alongside the
existing 012 exports. Names match the constitution's casing
convention (snake_case DB → camelCase TS via Drizzle's
`casing: 'snake_case'` config).

```ts
export const matchFormat = pgEnum('match_format', ['singles', 'doubles']);
export const matchPairingKind = pgEnum('match_pairing_kind', ['straight', 'crossed']);

export const matchAgreements = pgTable('match_agreements', { /* ... */ });
export const matchAgreementSides = pgTable('match_agreement_sides', { /* ... */ });

export type MatchAgreement = typeof matchAgreements.$inferSelect;
export type NewMatchAgreement = typeof matchAgreements.$inferInsert;
export type MatchAgreementSide = typeof matchAgreementSides.$inferSelect;
```

The existing `matches` export gains the new `agreementId` field
on its `$inferSelect` shape automatically once the column is
added.
