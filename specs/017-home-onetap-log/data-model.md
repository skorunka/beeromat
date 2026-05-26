# Data Model — Home redesign + one-tap log-a-beer

Phase 1 output for spec 017. **No new entities, no schema changes.**
This document records what the spec touches and how, to satisfy
Principle II review and the `/speckit-plan` data-model gate.

## Entities

| Entity | Source of truth | Reads in this spec | Writes in this spec |
|--------|-----------------|--------------------|---------------------|
| `Member` (existing) | `members` table | Yes — `id`, `role`, `clubId`, `displayName` | None |
| `Consumption` (existing) | `consumptions` table | Yes — most recent non-voided row for the member's `clubId` | Yes — one new row per one-tap log (via reused `logBeer` action) |
| `ConsumptionVoid` (existing) | `consumption_voids` table | Yes — used to filter voided rows out of the last-beer lookup | None |
| `BeerType` (existing) | `beer_types` table | Yes — `id`, `name`, `currentStock`, `isArchived`, `unitPriceMinor` | None directly; the reused `logBeer` action updates `currentStock` |
| `Club` (existing) | `clubs` table | Yes — `currencyCode`, `defaultLocale` (already loaded in `requireUnlocked()`) | None |

## New code, no new data

- `lib/db/queries/consumption.ts` gets a new exported function
  `lastBeerForMember(memberId, clubId)` returning either:
  - `null` (no consumption ever for that member in that club), or
  - `{ id, name, currentStock, isArchived, unitPriceMinor }` for
    the beer type of the most recent non-voided consumption.

  Query shape:
  ```sql
  SELECT bt.id, bt.name, bt.current_stock, bt.is_archived, bt.unit_price_minor
  FROM consumptions c
  JOIN beer_types bt ON bt.id = c.beer_type_id
  LEFT JOIN consumption_voids cv ON cv.consumption_id = c.id
  WHERE c.member_id = $1
    AND c.club_id = $2
    AND cv.consumption_id IS NULL  -- not voided
  ORDER BY c.created_at DESC
  LIMIT 1;
  ```

  Single round-trip. Indexed on
  `consumptions(member_id, club_id, created_at)` already (existing
  index supporting the `/tab` and `/history` pages).

## Validation rules and invariants

No new validation rules. Existing invariants preserved:

- **One consumption per tap.** The reused `logBeer` server action's
  atomicity guarantees apply (transaction wraps stock decrement +
  consumption insert).
- **Voids are tombstones.** The new query joins
  `consumption_voids` and filters out voided rows so a voided
  beer is never surfaced as the predictive default.
- **Club scope.** Both `member_id` and `club_id` are in the WHERE
  clause. Cross-club leakage is impossible by construction.
- **Stock invariant.** A returned beer with `current_stock <= 0`
  surfaces as the disabled state in the UI; the existing
  `logBeer` action will reject the log anyway, so the worst
  case is the UI shows a button the user can't actually use —
  exactly the explicit disabled state US3 requires.

## Out of scope

- **Schema migrations**: none needed.
- **Index additions**: the existing
  `idx_consumptions_member_club_created` (or equivalent — check
  `drizzle/` migrations) covers the query. No DDL required.
- **Denormalised "last beer" column on `members`**: rejected in
  research.md Decision 1.
