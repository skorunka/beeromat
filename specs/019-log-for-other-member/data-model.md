# Data Model — Log a beer on behalf of another member

Phase 1 output for spec 019. **One schema addition + extensive
reuse of existing tables.**

## Schema change

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `consumptions` | `on_behalf_reviewed_at` | `timestamp with time zone` (nullable) | NEW. Set when the consumer dismisses the home review banner for this row. Null until then. Always null for self-logged rows (`created_by_user_id == consumer's user_id`) — those don't need review. |

Migration: one ALTER TABLE statement. New rows default to null
implicitly.

## Entities (existing — reads + writes)

| Entity | Reads in this spec | Writes in this spec |
|--------|-------|-------|
| `Member` (existing) | Yes — picker over active members in active club, excluding the actor | None directly |
| `Consumption` (existing + 1 new col) | Yes — review-banner query joins back to find unreviewed on-behalf rows; tab query extended to surface attribution | Yes — `logBeerOnBehalfAction` inserts a row with `member_id = target, created_by_user_id = actor`. `dismissOnBehalfReviewAction` updates `on_behalf_reviewed_at`. |
| `ConsumptionVoid` (existing) | Yes — reject path uses the existing void cascade | Yes — when the consumer rejects from the banner, `voidConsumptionAction` is invoked; same path as a self-undo |
| `BeerType` (existing) | Yes — catalog for the picker, stock decrement target | Yes — `current_stock -= 1` on insert; `current_stock += 1` on void (existing path) |
| `StockChange` (existing) | None | Yes — `consumption_decrement` on insert, `consumption_void_increment` on void (existing path) |
| `DrinkSession` (existing) | Yes — auto-open if none exists (reusing the spec 016/017 path); the on-behalf consumption attaches to the open session | Possibly — auto-open via existing `getOrCreateOpenSession` |
| `BetTransfer` (existing) | Yes — `/tab` extension surfaces `to_member_id = $1` rows as `transfer_in` | None |

## New code, minimal new data

- `lib/db/queries/on-behalf-review.ts` (NEW): two helpers.
  ```text
  onBehalfReviewSummaryForMember(memberId, clubId): Promise<{
    count: number;
    rows: Array<{ consumptionId, loggerDisplayName, beerName, createdAt }>;
  }>
  ```
  Query: consumptions LEFT JOIN consumption_voids LEFT JOIN
  user (logger) LEFT JOIN beer_types, WHERE member_id = $1 AND
  club_id = $2 AND created_by_user_id <> consumer's user_id AND
  on_behalf_reviewed_at IS NULL AND consumption_voids.id IS
  NULL. Ordered by created_at DESC.

  ```text
  dismissOnBehalfReviewAction(consumptionId): Promise<{ ok; true } | { ok: false; code: ... }>
  ```
  Authz: the consumer's user_id must match the consumption's
  member's user_id. UPDATE consumptions SET
  on_behalf_reviewed_at = now() WHERE id = $1 AND member_id =
  (active member id) AND on_behalf_reviewed_at IS NULL.

- `lib/db/queries/consumption.ts` getMyTabForSession (MODIFIED):
  Today emits only `kind='consumption'`. Spec 019 adds:
  - For each consumption (already emitted): set `kind` to
    `'consumption'`; if `created_by_user_id <> consumer's
    user_id`, populate new `loggerDisplayName` field.
  - NEW: query `bet_transfers WHERE to_member_id = $1 AND
    club_id = $2 AND not voided`, joined to consumptions →
    beer_types for the beer name + match link. Emit each as
    `kind='transfer_in'` with `sourceMatchId` for the link.
  - Merge both arrays, sort by `createdAt DESC`. Compute total
    consistently (consumption price + transfer_in price each
    add; voided + transfer_out reduce — though `transfer_out`
    on the winner's tab is rare; left as a future extension).

## Validation rules + invariants

- **Picker scope**: actor cannot pick themselves; target must
  share `club_id`; target must be `is_active = true`.
- **On-behalf attribution preserved on void**: when the
  consumer rejects, the consumption row gets a `consumption_voids`
  entry but `created_by_user_id` stays the original logger.
  Jiří's audit (FR-007 + spec-018 distinction) still works
  retroactively.
- **Dismiss is idempotent**: `dismissOnBehalfReviewAction` on
  an already-reviewed row is a no-op (the WHERE clause's `IS
  NULL` skips it).
- **No new void path**: reject = invoke existing
  `voidConsumptionAction`. Constitution V satisfied without
  duplication.
- **Cross-club leak prevention**: every helper filters by
  `club_id` from the auth context. The picker query is
  WHERE-clause hard-bound.

## Out of scope

- Logging on behalf of an inactive / removed member.
- Bulk on-behalf logging (one beer for multiple targets in one
  call).
- Notification to the original logger when a void happens.
- Match-bet "on-behalf" semantics — match settlement already
  attributes to the winner's user; spec 019 only addresses
  direct consumption logging.
