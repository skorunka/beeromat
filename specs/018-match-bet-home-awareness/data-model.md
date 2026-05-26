# Data Model — Match-bet → home awareness

Phase 1 output for spec 018. **No new entities, no schema
changes.** This document captures what existing rows get touched
and the new invariant that the spec enforces.

## Entities

| Entity | Source of truth | Reads in this spec | Writes in this spec |
|--------|-----------------|--------------------|---------------------|
| `Club` (existing) | `clubs` table | Yes — `matchLoserBeerCount`, `currencyCode`, `defaultLocale` | None |
| `Member` (existing) | `members` table | Yes — `id`, `role`, `clubId` of all match participants | None |
| `MatchAgreement` (existing — spec 013) | `match_agreements` table | Yes — `forBeer`, `format`, `pairingKind` | Yes — updates `winningSide`, `resultRecordedAt`, `resultRecordedByUserId` (existing path; unchanged) |
| `MatchAgreementSide` (existing — spec 013) | `match_agreement_sides` table | Yes — to compute pairs + seat ordering for the split | None |
| `Match` (existing — spec 013) | `matches` table | None directly (created by existing settle path) | Yes — one row per pair (existing behavior) |
| `MatchBetTransfer` (existing — spec 013) | `match_bet_transfers` table | None | Yes — one row per bet transfer created |
| `BetTransfer` (existing — spec 013) | `bet_transfers` table | None | Yes — N rows per match, each linking a winner consumption to the loser |
| `Consumption` (existing) | `consumptions` table | Yes — `lastBeerForMember` lookup for default beer | Yes — N auto-created rows per match (one per beer owed, on the winner) |
| `BeerType` (existing) | `beer_types` table | Yes — cheapest-in-stock fallback, override validation | None directly (`logBeer`-style stock decrement DOES NOT happen in this spec — the bet beer isn't "drunk" in stock terms — see Invariants below) |
| `DrinkSession` (existing) | `drink_sessions` table | Yes — find or auto-open the active session | Yes (potentially) — auto-open if none exists, via existing `getOrCreateOpenSession` path |
| `ConsumptionVoid` / `BetTransferVoid` (existing) | `*_voids` tables | None | Yes — on match-void cascade (existing path; verified to cover the new rows) |

## New invariant introduced by this spec

For every settled match `M` where `M.forBeer = true`:

  `count(match_bet_transfers WHERE match_id = M.id)
   == count(bet_transfers WHERE id IN <those transfers>)
   == count(consumptions WHERE id IN <those transfers' source_consumption_id>)
   == sum(splitBeerCountAcrossPairs(club.matchLoserBeerCount, pairs(M)))`

In plain English: the number of bet-linked consumption rows
created equals the number of transfers equals the number of
match-bet-transfer links equals the configured loser beer count
per side (split across the pairs of the losing side per the
algorithm in `research.md` §2). No partial settlement is
possible (transaction rollback covers the failure modes).

## New code, no new data

- `lib/match/split-beer-count.ts` — pure helper, unit-testable.
- `lib/match/default-bet-beer.ts` — pure helper that takes a
  catalog snapshot + an optional override + the winner's
  last-beer and returns the chosen `BeerType` or throws
  `NoBeerInStockError`. No DB access — caller passes in the
  catalog rows.
- `lib/db/queries/match-bet-summary.ts` — new query helper for
  the home page:
  ```sql
  SELECT
    count(*)::int AS bet_count,
    array_agg(DISTINCT m.id) AS source_match_ids
  FROM consumptions c
  JOIN bet_transfers bt ON bt.source_consumption_id = c.id
  JOIN match_bet_transfers mbt ON mbt.bet_transfer_id = bt.id
  JOIN matches m ON m.id = mbt.match_id
  LEFT JOIN consumption_voids cv ON cv.consumption_id = c.id
  LEFT JOIN bet_transfer_voids bv ON bv.bet_transfer_id = bt.id
  WHERE bt.to_member_id = $1
    AND bt.club_id = $2
    AND cv.consumption_id IS NULL
    AND bv.bet_transfer_id IS NULL
    AND c.created_at >= now() - INTERVAL '24 hours';
  ```
  Returns `{ betCount: number, sourceMatchIds: string[] }` or
  `{ betCount: 0, sourceMatchIds: [] }`. 24h window keeps the
  module from sticking around indefinitely; matches before then
  silently roll off home (audit trail unaffected).

- `lib/db/queries/match-agreements.ts` — `settleOnePair`
  rewritten per Decision 3. New signature: takes a
  `beerTypeId` (the chosen default OR override, resolved by the
  caller). Doesn't query for default itself — caller pre-resolves
  via `default-bet-beer.ts`.

## Validation rules and invariants

- **Override validation**: if `RecordResultForm` submits an
  override `beerTypeId`, the action verifies it belongs to the
  active club AND is non-archived AND has `current_stock > 0`.
  Mismatch → `VALIDATION_FAILED` response with field error on
  `beerTypeId`.
- **No-beer-in-stock**: if Decision 1's fallback chain runs out,
  the action returns `{ ok: false, code: 'NO_BEER_IN_STOCK' }`
  and the transaction rolls back. The recorder sees a Czech
  message ("Klub nemá na skladě žádné pivo — naskladněte před
  záznamem zápasu").
- **Session auto-open**: same path `logBeer` uses — opens a
  session with `title: null` if none exists (see spec 016's date
  dedup fix; auto-opened sessions get the generic "Round" /
  "Pivo" fallback label).
- **Stock decrement on auto-create**: the bet-linked
  consumptions DO decrement the winner's beer stock the same way
  a regular `logBeer` would. The winner "drinks" a beer; the cost
  goes to the loser via the transfer. This matches the existing
  data model (the loser doesn't drink anything — they pay).
- **Cross-club leakage**: `to_member_id` + `club_id` filter on
  the match-bet-summary query is non-negotiable (Constitution II).

## Out of scope

- Schema migrations (none).
- Index additions (existing indices on
  `consumptions(member_id, club_id, created_at)`,
  `bet_transfers(to_member_id, created_at)`,
  `match_bet_transfers(match_id)` cover the new query path).
- Multi-club bet semantics (Constitution II — no cross-club).
- Logging-for-another-member (separate backlog item).
- Role-aware home modules (spec 019).
