# Phase 1 Data Model: Beer Consumption Ledger (v1 MVP)

**Feature**: `001-beer-consumption-ledger` | **Date**: 2026-05-19

This document defines every persisted entity for v1. All tables are in **PostgreSQL** (Neon-hosted), accessed via **Drizzle ORM** (`drizzle-orm ^0.45`). Field types are given in Drizzle/Postgres terms.

## Conventions

- Every domain table has `id` (UUID v4, primary key, generated server-side), `club_id` (UUID FK), `created_at` (timestamptz NOT NULL, default `now()`), `created_by_user_id` (UUID FK to `users`, NOT NULL except where noted).
- All monetary amounts are stored as `bigint` integer **minor units** (CZK halléř, EUR cent). Display formatting via `Intl.NumberFormat` at render time.
- All timestamps are `timestamptz` (UTC server-side; rendered in user locale).
- Soft-delete and audit semantics: no `DELETE` paths in app code; corrections via compensating rows (void tables) or status transitions.
- Index naming: `idx_<table>_<columns>`. Unique constraints: `uniq_<table>_<columns>`. FK names: `fk_<table>_<reference>`.

---

## Entity-relationship overview

```
┌───────┐ 1───* ┌─────────────────────┐
│ club  │       │ club_banking_profile │
└───┬───┘       └─────────────────────┘
    │ 1───*
    ├───────────────┬────────────────┬────────────────┬───────────────┐
    ▼               ▼                ▼                ▼               ▼
┌────────┐    ┌────────────┐   ┌──────────┐   ┌──────────────┐  ┌──────────┐
│ member │    │ invitation │   │beer_type │   │drink_session │  │ payment  │
└───┬────┘    └────────────┘   └────┬─────┘   └──────┬───────┘  └────┬─────┘
    │ 1───*                         │                │                │ 1───*
    ▼                               ▼                ▼                ▼
┌────────────────┐         ┌─────────────────┐ ┌──────────────┐ ┌─────────────────────────┐
│ device_session │         │ stock_change    │ │ consumption  │ │payment_state_transitions│
└────────────────┘         └─────────────────┘ └─────┬────────┘ └─────────────────────────┘
                                                     │
                                  ┌──────────────────┼──────────────────────┐
                                  ▼                  ▼                      ▼
                          ┌──────────────────┐ ┌──────────────┐ ┌─────────────────────┐
                          │consumption_void  │ │ bet_transfer │ │ bet_transfer_void   │
                          └──────────────────┘ └──────────────┘ └─────────────────────┘
```

`user` is owned by **Better Auth** (it manages its own tables: `users`, `sessions`, `verification_tokens` for magic links). Our `member` table references `users.id` via `user_id`; a user exists once globally, but a member exists once per (user, club) — anticipating future multi-club membership.

---

## 1. `clubs`

The tenant root. Every domain row points to one of these.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `text` | NOT NULL | Display name (e.g., "TK Slávia Praha") |
| `currency_code` | `varchar(3)` | NOT NULL, default `'CZK'` | ISO 4217 |
| `default_locale` | `varchar(8)` | NOT NULL, default `'cs-CZ'` | BCP 47; v1 catalogs ship `cs` and `en` |
| `default_low_stock_threshold` | `integer` | NOT NULL, default `5` | applied to new `beer_types` |
| `consumption_undo_window_seconds` | `integer` | NOT NULL, default `300` | self-undo window for FR-017 |
| `device_inactivity_lock_seconds` | `integer` | NOT NULL, default `28800` | 8 h; PIN re-prompt threshold |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | bumped on every UPDATE |

**Indexes**: PK only.
**Notes**: v1 seeds **exactly one** row. No application path creates a second club.

---

## 2. `club_banking_profiles`

Holds per-club payment instruction config. Separate table (not columns on `clubs`) so admins can configure banking later without backfilling defaults, and so we can keep raw banking details out of common joins.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `club_id` | `uuid` | PK, FK → `clubs.id` ON DELETE RESTRICT | one row per club |
| `iban` | `text` | nullable | NULL means "self-pay disabled, FR-038" |
| `account_holder_name` | `text` | nullable | shown next to QR (informational) |
| `revolut_handle` | `text` | nullable | e.g., `revtag` or full `revolut.me/foo` URL |
| `default_qr_message` | `text` | nullable | optional prefix for `MSG:` in SPAYD |
| `next_variable_symbol` | `bigint` | NOT NULL, default `1` | monotonic counter for `X-VS` in QR Platba |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_by_user_id` | `uuid` | FK → `users.id` | last admin to change it |

**Indexes**: PK only.

---

## 3. `members`

A person's presence in a specific club. Maps a Better Auth `user` to a `club` with a role.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` ON DELETE RESTRICT | |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (Better Auth) ON DELETE RESTRICT | |
| `email` | `text` | NOT NULL | denormalised from `users.email` for fast list views |
| `display_name` | `text` | NOT NULL | user-set during onboarding |
| `role` | `member_role` (enum) | NOT NULL, default `'member'` | `member` / `stock_manager` / `treasurer` / `club_admin` |
| `is_active` | `boolean` | NOT NULL, default `true` | deactivation preserves history (FR-029 edge case) |
| `accepted_invitation_at` | `timestamptz` | nullable | NULL for seeded admin |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | FK → `users.id` | the inviter; NULL for seeded admin |

**Indexes**:
- `uniq_members_club_user` ON (`club_id`, `user_id`) — one membership per user per club
- `idx_members_club_active` ON (`club_id`, `is_active`) — for member-list queries
- `idx_members_club_role` ON (`club_id`, `role`) — for "who are the treasurers" lookups

**Postgres enum**: `CREATE TYPE member_role AS ENUM ('member', 'stock_manager', 'treasurer', 'club_admin');`

---

## 4. `invitations`

Pending or accepted authorisations for an email to join a club with a role.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `email` | `text` | NOT NULL | lowercased; the invited recipient |
| `role` | `member_role` | NOT NULL | role to assign on acceptance |
| `token_hash` | `text` | NOT NULL | argon2id hash of the magic-link token |
| `expires_at` | `timestamptz` | NOT NULL | typically `created_at + 14 days` |
| `status` | `invitation_status` (enum) | NOT NULL, default `'pending'` | `pending` / `accepted` / `expired` / `revoked` |
| `accepted_at` | `timestamptz` | nullable | set on acceptance |
| `accepted_by_user_id` | `uuid` | nullable, FK → `users.id` | resolved on acceptance |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | the inviter (admin / treasurer) |

**Indexes**:
- `uniq_invitations_club_email_pending` ON (`club_id`, `email`) WHERE `status = 'pending'` — at most one open invite per (club, email)
- `idx_invitations_token_hash` ON (`token_hash`) — for the magic-link callback lookup
- `idx_invitations_expires_at` ON (`expires_at`) WHERE `status = 'pending'` — for batch expiration job (future)

**Postgres enum**: `CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');`

---

## 5. `device_sessions`

A member's registered presence on a specific device with a hashed PIN.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | matches the `device_id` cookie value |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` ON DELETE CASCADE | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | denormalised from the user's member row (single-club v1) |
| `device_label` | `text` | nullable | user-friendly ("iPhone of Pavel"); v1 may auto-fill from User-Agent |
| `pin_hash` | `text` | NOT NULL | argon2id PHC string |
| `failed_attempts` | `integer` | NOT NULL, default `0` | reset on success |
| `locked_until` | `timestamptz` | nullable | set to far-future after 5 wrong attempts |
| `last_unlock_at` | `timestamptz` | nullable | drives "needs PIN re-prompt after inactivity" |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Indexes**:
- `idx_device_sessions_user` ON (`user_id`) — list user's devices for "Manage devices" admin
- PK on `id` (also serves the cookie-lookup path)

**Notes**: A device session is **removed** (hard-deleted) when the user explicitly signs out or resets their PIN via fresh magic link. This is not domain history — it's auth machinery — so the no-hard-delete principle does not apply.

---

## 6. `beer_types`

The catalog of beers offered by a club, with stock and pricing.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `name` | `text` | NOT NULL | "Pilsner Urquell 0.5l" |
| `unit_price_minor` | `bigint` | NOT NULL | minor units of club currency (CZK halléř) |
| `current_stock` | `integer` | NOT NULL, default `0`, CHECK ≥ 0 | atomically decremented on consumption insert |
| `low_stock_threshold` | `integer` | NOT NULL, default `5` | |
| `is_archived` | `boolean` | NOT NULL, default `false` | retired catalog item; preserves history |
| `display_order` | `integer` | NOT NULL, default `0` | for the log screen pick list |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | |

**Indexes**:
- `idx_beer_types_club_active_order` ON (`club_id`, `is_archived`, `display_order`) — the log-screen list query
- `uniq_beer_types_club_name_active` ON (`club_id`, `name`) WHERE `is_archived = false` — no duplicate active names

---

## 7. `drink_sessions`

A club-scoped container for consumption events ("after Tuesday's match").

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `title` | `text` | nullable | optional; defaults to local date at auto-open |
| `started_at` | `timestamptz` | NOT NULL | |
| `ended_at` | `timestamptz` | nullable | NULL while open |
| `opened_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | |
| `closed_by_user_id` | `uuid` | nullable, FK → `users.id` | set when ended |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Indexes**:
- `uniq_drink_sessions_club_open` ON (`club_id`) WHERE `ended_at IS NULL` — at most one open session per club (FR-015)
- `idx_drink_sessions_club_started` ON (`club_id`, `started_at` DESC) — history listing

---

## 8. `consumptions`

A single beer drunk by a member. Append-only — corrections via `consumption_voids`.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `drink_session_id` | `uuid` | NOT NULL, FK → `drink_sessions.id` ON DELETE RESTRICT | |
| `member_id` | `uuid` | NOT NULL, FK → `members.id` | the person who drank it (after bet transfer applied, the effective debtor) |
| `beer_type_id` | `uuid` | NOT NULL, FK → `beer_types.id` ON DELETE RESTRICT | |
| `unit_price_minor_snapshot` | `bigint` | NOT NULL | price at log time (price-snapshot pattern) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | the logger (usually the same user as `member_id`'s user) |

**Indexes**:
- `idx_consumptions_session_member` ON (`drink_session_id`, `member_id`) — per-member tab in a session
- `idx_consumptions_member_created` ON (`member_id`, `created_at` DESC) — member history view
- `idx_consumptions_club_created` ON (`club_id`, `created_at` DESC) — admin overview

**Stock atomicity**: Insert + decrement happens inside a single SQL transaction with `SELECT … FOR UPDATE` on the `beer_types` row (or equivalent atomic decrement with CHECK):
```sql
UPDATE beer_types SET current_stock = current_stock - 1
  WHERE id = $1 AND current_stock > 0
  RETURNING current_stock;
-- if 0 rows updated → ABORT, beer is out of stock (FR-027)
INSERT INTO consumptions (...);
```

---

## 9. `consumption_voids`

Compensating events for voided consumptions.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `consumption_id` | `uuid` | NOT NULL, FK → `consumptions.id` | |
| `reason` | `text` | nullable | optional explanation |
| `voided_at` | `timestamptz` | NOT NULL, default `now()` | |
| `voided_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | logger (within window) or stock_mgr/treasurer/admin |

**Indexes**:
- `uniq_consumption_voids_consumption` ON (`consumption_id`) — at most one void per consumption
- `idx_consumption_voids_club_voided` ON (`club_id`, `voided_at` DESC)

**Stock restoration**: Voiding a consumption restores `+1` to the `beer_type.current_stock` in the same SQL transaction.

---

## 10. `bet_transfers`

Moves the financial weight of one consumption from the original drinker to the loser of the bet.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `source_consumption_id` | `uuid` | NOT NULL, FK → `consumptions.id` | |
| `from_member_id` | `uuid` | NOT NULL, FK → `members.id` | the winner (whose tab is credited) |
| `to_member_id` | `uuid` | NOT NULL, FK → `members.id` | the loser (whose tab is charged) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | the initiator |

**Constraints**:
- CHECK `from_member_id <> to_member_id` (FR-022, no self-transfer)
- `uniq_bet_transfers_source` ON (`source_consumption_id`) WHERE no matching `bet_transfer_voids.bet_transfer_id` — at most one active transfer per consumption (FR-020). Implementation: a partial unique index on `source_consumption_id` plus application-level enforcement that voided transfers don't block a re-transfer.

**Indexes**:
- `idx_bet_transfers_from_member` ON (`from_member_id`, `created_at` DESC)
- `idx_bet_transfers_to_member` ON (`to_member_id`, `created_at` DESC)

**Per FR-020**: Application layer must verify the source consumption belongs to the **currently open** drink session at insert time.

---

## 11. `bet_transfer_voids`

Compensating events for voided bet transfers.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `bet_transfer_id` | `uuid` | NOT NULL, FK → `bet_transfers.id` | |
| `reason` | `text` | nullable | |
| `voided_at` | `timestamptz` | NOT NULL, default `now()` | |
| `voided_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | the original logger or a treasurer/admin |

**Indexes**:
- `uniq_bet_transfer_voids_transfer` ON (`bet_transfer_id`)

---

## 12. `stock_changes`

Restocks and adjustments to beer-type stock levels.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `beer_type_id` | `uuid` | NOT NULL, FK → `beer_types.id` | |
| `delta` | `integer` | NOT NULL | positive for restock, positive/negative for adjustment |
| `kind` | `stock_change_kind` (enum) | NOT NULL | `restock` / `adjustment` / `consumption_decrement` / `consumption_void_increment` |
| `reason` | `text` | nullable | mandatory for `adjustment`; optional otherwise |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | |

**Postgres enum**: `CREATE TYPE stock_change_kind AS ENUM ('restock', 'adjustment', 'consumption_decrement', 'consumption_void_increment');`

**Indexes**:
- `idx_stock_changes_beer_created` ON (`beer_type_id`, `created_at` DESC)

**Notes**:
- Every change to `beer_types.current_stock` writes a corresponding `stock_changes` row in the same transaction — this is the audit ledger that lets us reconstruct stock from scratch.
- `consumption_decrement` and `consumption_void_increment` are written automatically by the consumption/void code paths; restock and adjustment are user-triggered.

---

## 13. `payments`

Member-claimed or treasurer-recorded confirmations that money moved. Status machine `claimed → confirmed | disputed` for member-initiated, or directly `confirmed` for treasurer-manual. Voids handled via state transitions.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `member_id` | `uuid` | NOT NULL, FK → `members.id` | the payer |
| `amount_minor` | `bigint` | NOT NULL, CHECK ≥ 0 | minor units, club currency |
| `currency_code` | `varchar(3)` | NOT NULL | snapshot from club at creation; immutable per row |
| `status` | `payment_status` (enum) | NOT NULL | `claimed` / `confirmed` / `disputed` / `voided` |
| `origin` | `payment_origin` (enum) | NOT NULL | `member_initiated` / `treasurer_initiated` |
| `variable_symbol` | `bigint` | nullable | non-null for member-initiated via SPAYD |
| `note` | `text` | nullable | "paid in cash", "Revolut direct", treasurer note, etc. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | the member (claim) or treasurer (manual record) |

**Postgres enums**:
```sql
CREATE TYPE payment_status AS ENUM ('claimed', 'confirmed', 'disputed', 'voided');
CREATE TYPE payment_origin AS ENUM ('member_initiated', 'treasurer_initiated');
```

**Indexes**:
- `idx_payments_club_status` ON (`club_id`, `status`) — treasurer pending list (`status = 'claimed'`)
- `idx_payments_member_status` ON (`member_id`, `status`) — per-member balance calculation
- `uniq_payments_club_vs` ON (`club_id`, `variable_symbol`) WHERE `variable_symbol IS NOT NULL` — SPAYD references are unique within a club

**Status transitions** (only writable via state-transition rows; see #14):

```
claimed  --[treasurer confirm]-->  confirmed
claimed  --[treasurer dispute]-->  disputed
confirmed --[treasurer void]-->    voided
```

The current `status` column is updated alongside writing the transition row, both in the same transaction. Balance derivation queries `WHERE status = 'confirmed'`.

---

## 14. `payment_state_transitions`

Append-only audit log of every status change on a Payment.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `club_id` | `uuid` | NOT NULL, FK → `clubs.id` | |
| `payment_id` | `uuid` | NOT NULL, FK → `payments.id` | |
| `from_status` | `payment_status` | nullable | NULL for the initial row at payment creation |
| `to_status` | `payment_status` | NOT NULL | |
| `reason` | `text` | nullable | mandatory for `dispute` and `void` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | |

**Indexes**:
- `idx_payment_state_transitions_payment` ON (`payment_id`, `created_at` ASC) — full timeline view for a single payment
- `idx_payment_state_transitions_club_created` ON (`club_id`, `created_at` DESC) — global audit

---

## Derived view: member balance

A member's outstanding balance is calculated, not stored, per FR-031:

```
balance(member) =
    sum(effective_consumption_minor across all sessions)
  - sum(payments.amount_minor WHERE status = 'confirmed')

effective_consumption_minor(member) =
    sum(unit_price_minor_snapshot of own consumptions not voided)
  - sum(unit_price_minor_snapshot of consumptions transferred away via active bet_transfer)
  + sum(unit_price_minor_snapshot of consumptions transferred in via active bet_transfer)
```

An "active" bet transfer is one without a corresponding `bet_transfer_voids` row.

**Performance note**: For 20 members × ~50 sessions/year × ~5 beers each, the raw row count is ~5000/year per club. A SUM-over-WHERE query is sub-millisecond at this scale. **No materialised view or balance-cache table is needed for v1**; revisit if a club exceeds ~50k consumptions or query times exceed 50ms.

---

## Better Auth tables (managed)

Better Auth manages these on its own — we do NOT define them in our Drizzle schema, but we reference `users.id` extensively:

- `users` (id, email, name, image, email_verified, created_at, updated_at)
- `sessions` (id, user_id, expires_at, token, …)
- `accounts` (oauth-style providers; we won't use OAuth in v1)
- `verifications` (the magic-link token store)

`users.id` is a UUID. Better Auth's Drizzle adapter generates the schema; we import their adapter rather than hand-rolling these tables.

---

## Drizzle schema file layout (`lib/db/schema/`)

```text
lib/db/schema/
├── index.ts                 # re-exports all tables for `drizzle()` instance
├── auth.ts                  # Better Auth tables (via adapter)
├── clubs.ts                 # clubs, club_banking_profiles
├── members.ts               # members, invitations, device_sessions
├── catalog.ts               # beer_types, stock_changes
├── sessions.ts              # drink_sessions
├── consumption.ts           # consumptions, consumption_voids
├── bets.ts                  # bet_transfers, bet_transfer_voids
└── payments.ts              # payments, payment_state_transitions
```

---

## Migration milestones

A reasonable initial migration ordering (for `/speckit-tasks` to expand on):

1. `0001_init_auth.sql` — Better Auth tables (via their migrate command)
2. `0002_clubs.sql` — `clubs`, `club_banking_profiles`, all enums (`member_role`, `invitation_status`, `payment_status`, `payment_origin`, `stock_change_kind`)
3. `0003_members.sql` — `members`, `invitations`, `device_sessions`
4. `0004_catalog.sql` — `beer_types`, `stock_changes`
5. `0005_sessions.sql` — `drink_sessions`
6. `0006_consumption.sql` — `consumptions`, `consumption_voids`
7. `0007_bets.sql` — `bet_transfers`, `bet_transfer_voids`
8. `0008_payments.sql` — `payments`, `payment_state_transitions`
9. `0009_seed_club.sql` — seed the single v1 club (name + currency + locale) and the seed admin member

All migrations generated by `drizzle-kit generate` from the schema files above; committed to `drizzle/`.

---

## Constitution Check (re-evaluated)

- **II. Tenant-Aware Schema**: ✅ `club_id` NOT NULL FK on every domain table.
- **V. Auditable History**: ✅ No domain table has an application-level DELETE path. `consumption_voids`, `bet_transfer_voids`, `payment_state_transitions`, and `stock_changes` make every correction append-only.
- All other principles unchanged.

Data model is ready for the contract definitions and quickstart.
