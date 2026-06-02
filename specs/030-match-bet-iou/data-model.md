# Data Model: Deferred match-bet settlement (beer IOU)

## Change 1 — `match_agreements.bet_beer_type_id` (new column)

The beer the match is played for, chosen at create when `forBeer = true`.

| Column | Type | Notes |
|---|---|---|
| `bet_beer_type_id` | `uuid` NULL | FK → `beer_types.id` (`onDelete: 'set null'`). NULL for friendly matches and for pre-030 agreements. |

- No new constraint tying it to `forBeer` at the DB level (kept nullable for back-compat); the create form only sets it when `forBeer`.
- Used at record time to stamp each debt's `planned_beer_type_id`.

## Change 2 — `match_bet_debts` (new table)

One row per losing↔winning pair of a recorded **for-beer** match (singles = 1,
doubles = 2). Holds the obligation until delivered. Append-only by status transition
(Constitution V): `pending` → `settled` | `voided`. Never `UPDATE`d destructively
beyond the settle/void stamp; never `DELETE`d.

```text
match_bet_debt_status = enum('pending', 'settled', 'voided')
```

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `club_id` | `uuid` NOT NULL | FK → `clubs.id` (`restrict`). Principle II. |
| `match_id` | `uuid` NOT NULL | FK → `matches.id` (`restrict`). The specific pair's history row. |
| `agreement_id` | `uuid` NOT NULL | FK → `match_agreements.id` (`restrict`). Grouping (doubles = 2 debts share it). |
| `from_member_id` | `uuid` NOT NULL | FK → `members.id` (`restrict`). The **loser** — owes the beer. |
| `to_member_id` | `uuid` NOT NULL | FK → `members.id` (`restrict`). The **winner** — is owed. |
| `planned_beer_type_id` | `uuid` NULL | FK → `beer_types.id` (`set null`). Copied from agreement at record; default at delivery. |
| `beer_count` | `smallint` NOT NULL | From club `matchLoserBeerCount` (default 1). |
| `status` | `match_bet_debt_status` NOT NULL | default `'pending'`. |
| `created_at` | `timestamptz` NOT NULL | `defaultNow()`. |
| `created_by_user_id` | `uuid` NOT NULL | FK → `users.id` (`restrict`). The result recorder. |
| `settled_at` | `timestamptz` NULL | Set on delivery. |
| `settled_by_user_id` | `uuid` NULL | FK → `users.id` (`set null`). Who tapped "Předáno". |
| `settled_beer_type_id` | `uuid` NULL | FK → `beer_types.id` (`set null`). The beer actually delivered (may differ from planned). |
| `voided_at` | `timestamptz` NULL | Set when an agreement reversal/cancel drops a still-pending debt. |
| `voided_by_user_id` | `uuid` NULL | FK → `users.id` (`set null`). |

### Constraints

- `chk_match_bet_debts_distinct_members`: `from_member_id <> to_member_id`.
- `chk_match_bet_debts_status_consistency`:
  - `status = 'settled'` ⇒ `settled_at IS NOT NULL`
  - `status = 'voided'` ⇒ `voided_at IS NOT NULL`
  - `status = 'pending'` ⇒ `settled_at IS NULL AND voided_at IS NULL`
- `chk_match_bet_debts_beer_count_positive`: `beer_count >= 1`.
- The realized money lives in `bet_transfers` + `match_bet_transfers` (linked by
  `match_id`); a settled debt's transfers are found via the existing
  `match_bet_transfers` link — no extra FK column needed (avoids a debt↔transfer
  1:N column). *(If per-debt linkage proves necessary, add a `match_bet_debt_id` FK
  on `bet_transfers` later; not needed for v030 because one match row = one debt =
  one pair.)*

### Indexes

- `idx_match_bet_debts_from_pending` on `(from_member_id)` `WHERE status = 'pending'` — loser's open IOUs.
- `idx_match_bet_debts_to_pending` on `(to_member_id)` `WHERE status = 'pending'` — winner's open IOUs.
- `idx_match_bet_debts_agreement` on `(agreement_id)` — group a match's debts (reverse path).
- `idx_match_bet_debts_match` on `(match_id)`.
- `idx_match_bet_debts_club` on `(club_id, created_at)`.

### State transitions

```text
            record for-beer result
   (none) ───────────────────────────▶ pending
                                          │
              deliver ("Předáno")         │  reverse/cancel while pending
   pending ──────────────────────▶ settled│  pending ──────────────────▶ voided
   (creates beer_count consumptions + bet_transfers winner→loser,
    decrements stock, stamps settled_at/by + settled_beer_type_id)

   settled ──reverse after delivery──▶ (status stays settled; the
            created bet_transfer is voided via bet_transfer_voids —
            existing path — so the money unwinds without touching the debt row)
```

## Relationships

- `match_agreements (1) ── (0..2) match_bet_debts` via `agreement_id` (only when forBeer).
- `matches (1) ── (1) match_bet_debts` via `match_id` (one pair = one match row = one debt).
- `match_bet_debts.planned/settled_beer_type_id → beer_types`.
- Settled debt → its `matches.id` → `match_bet_transfers` → `bet_transfers` (existing chain) for the realized cost.

## Invariants

- A `pending` debt contributes **nothing** to any tab total, per-beer breakdown, or
  member balance (no consumption/transfer exists yet).
- A `settled` debt's money is represented entirely by ordinary `bet_transfers` +
  consumptions, so `effectiveConsumptionTotal` and Σ countable tab entries stay equal
  (the balance invariant — see memory `project_balance_aggregation_invariant`).
- At most one terminal transition per debt (status is one-way out of `pending`).
