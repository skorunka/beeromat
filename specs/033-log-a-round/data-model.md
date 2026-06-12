# Phase 1 Data Model: Log a round

**No schema change. No migration.** A round reuses existing tables. This document
records the entities the feature touches, the validation rules, and the write
pattern.

## Persisted entities (existing, reused as-is)

### `consumptions` (one row written per drinker in a round)

| Field | Source for a round item | Notes |
|---|---|---|
| `id` | generated | one per logged beer |
| `club_id` | actor's club | tenant scope |
| `drink_session_id` | the open session (get-or-open once for the whole batch) | same session for all items |
| `member_id` | **the drinker** (`item.memberId`) | the tab the beer lands on |
| `beer_type_id` | `item.beerTypeId` (round default or per-person override) | |
| `unit_price_minor_snapshot` | the beer's current `unit_price_minor` | price snapshot, per existing logs |
| `created_by_user_id` | **the fetcher** (actor's user) | drives the "logged for you" review |
| `created_at` | now | |
| `on_behalf_reviewed_at` | null | set later if the drinker keeps/clears the review |

**Self vs on-behalf is emergent, not a column**: when `member_id`'s user ==
`created_by_user_id` (the fetcher's own beer), the existing review predicate
(`member_id == me AND created_by_user_id != my user`) yields no review item; for
every teammate it yields one. No flag needed.

### `beer_types` (stock)

- `current_stock` decremented by 1 per logged item via the atomic
  `UPDATE … SET current_stock = current_stock - 1 WHERE id = ? AND current_stock > 0
  RETURNING` — the existing race-safe pattern. No row returned → item skipped
  (out of stock).

### `stock_changes` (audit)

- One `kind = 'consumption_decrement'`, `delta = -1` audit row per **logged**
  item (skipped items write nothing). Identical to single-log audit.

### `drink_sessions`

- Get-or-open the single open session for the club **once** at the start of the
  batch (race-safe `onConflictDoNothing` + re-select, exactly as the single-log
  paths). All items in the round attach to that session.

## Transient entity (client-side only, never persisted as such)

### Round (composition state)

| Field | Type | Validation |
|---|---|---|
| `defaultBeerTypeId` | uuid \| null | required before submit (submit disabled otherwise) |
| `drinkers` | set of `memberId` | ≥ 1 to enable submit; the logger is pre-selected |
| `overrides` | map `memberId → beerTypeId` | optional; only for selected drinkers; cleared reverts to default |

On submit this collapses to the action input
`items = [...drinkers].map(m => ({ memberId: m, beerTypeId: overrides[m] ?? defaultBeerTypeId }))`.

## Validation rules (Zod — `logRoundSchema`, server-authoritative)

- `items`: array, **min length 1** (`EMPTY` otherwise — but the UI disables
  submit, so this is the server seatbelt).
- each item: `{ memberId: uuid, beerTypeId: uuid }`.
- **memberIds distinct** across `items` (FR-012, one beer per drinker per round)
  — schema-level refinement rejecting duplicates before the action runs.
- Per-item authorization + availability is enforced **inside** the action
  (member is active + in the actor's club; beer is in the club + not archived;
  stock > 0), not in the schema, because those are DB facts and partial-skip
  (D3) handles the availability failures rather than rejecting the payload.

## Authorization

- `requireUnlocked` (magic-link + device PIN), same as every log path.
- Every `item.memberId` must resolve to an **active member of the actor's club**
  (the logger included). A memberId outside the club / inactive → that item is
  reported as `TARGET_NOT_IN_CLUB` in `skipped` (it cannot mint a row on a
  foreign tab). No elevated role required — logging for a clubmate is a member
  capability, identical to the existing on-behalf log.

## State / lifecycle

- A logged beer follows the **existing** consumption lifecycle: undoable by the
  logger within the club undo window, rejectable by the drinker via the
  "logged for you" review (on-behalf items only), voided via the existing
  compensating-row `voidConsumptionAction`. There is **no** round-level state.
