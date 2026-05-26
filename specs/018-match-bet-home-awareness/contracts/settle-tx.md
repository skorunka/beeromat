# Contract — match-settle transaction (modified by spec 018)

This contract documents the new behavior of `recordResultTx` /
`settleOnePair` after spec 018 ships. It is the source of truth
the integration tests assert against.

## Inputs

From `RecordResultForm` via `recordResultAction`:

```ts
{
  agreementId: string;                  // existing — the agreement to settle
  winningSide: 'A' | 'B';               // existing
  beerTypeId?: string;                  // NEW — optional override
}
```

The optional `beerTypeId` is validated by Zod
(`recordResultSchema`) and additionally by `recordResultAction`
(belongs to active club + non-archived + `current_stock > 0`).
On validation failure → `{ ok: false, code: 'VALIDATION_FAILED',
fieldErrors: { beerTypeId: [...] } }`.

## Output (success)

```ts
{
  ok: true;
  matchRowIds: string[];        // one per pair (1 for singles, 2 for doubles)
  transferredCount: number;     // total bet_transfer rows created
  requestedCount: number;       // == transferredCount in spec 018 (always)
  betBeerTypeId: string;        // NEW — which beer was used
}
```

## Output (failure — new code added)

```ts
{ ok: false; code: 'NO_BEER_IN_STOCK' }
```

Returned when the resolution chain (override → last-beer →
cheapest in-stock) finds no eligible beer. Transaction rolls
back; no match is recorded.

Other existing failure codes preserved: `NOT_FOUND`,
`NOT_AUTHORIZED`, `ALREADY_RECORDED`, `CANCELLED`.

## Transaction body (post-spec-018 semantics)

For a `forBeer=true` match agreement with winningSide W:

1. Load `clubs.matchLoserBeerCount` (today: dead config, default 1).
2. Load `match_agreement_sides` for the agreement → compute
   `pairs` via existing `computePairs(format, pairingKind,
   winningSide, sides)`.
3. **Resolve the default beer ONCE for the whole match** (not
   per pair): try override → winner-of-the-first-pair's
   `lastBeerForMember` → cheapest in-stock. If none, throw
   `NoBeerInStockError` (caught at the outer level and returned
   as `NO_BEER_IN_STOCK`). The choice is shared across all
   pairs in the match — using different beers per pair would be
   surprising.
4. Compute the split: `splitBeerCountAcrossPairs(matchLoserBeerCount, pairs.length)`.
5. Find-or-auto-open the drink session for the club.
6. **For each pair `(W, L)` with allotted `beerCount[i]`**:
   - Insert the `match` row (existing behavior, unchanged).
   - For `j = 0..beerCount[i]-1`:
     - Insert a `consumption` row with:
       - `clubId: match.clubId`
       - `drinkSessionId: session.id`
       - `memberId: W (winner)`
       - `beerTypeId: <resolved default>`
       - `unitPriceMinorSnapshot: <beerType.unitPriceMinor>`
       - `createdByUserId: recorder`
     - Decrement `beer_types.current_stock` for the chosen beer
       by 1 (same path `logBeer` uses; insert a `stock_changes`
       audit row).
     - Insert a `bet_transfer` row:
       - `clubId: match.clubId`
       - `sourceConsumptionId: <the consumption just inserted>`
       - `fromMemberId: W (winner)`
       - `toMemberId: L (loser)`
       - `createdByUserId: recorder`
     - Insert a `match_bet_transfers` link row.
7. Update `match_agreements` with `winningSide`,
   `resultRecordedAt`, `resultRecordedByUserId` (existing
   optimistic-concurrency stamp; unchanged).
8. Return success payload.

A failure at any step rolls the whole transaction back. The
existing optimistic-concurrency check at step 7 catches the
double-record race.

## Stock invariants

The bet beer counts against the winner's `current_stock` and
inserts a `stock_changes` row — same as a regular `logBeer`
write. **The winner is the one "drinking" the beer in stock-
terms.** The loser pays via the transfer; nothing leaves the
loser's stock.

This matches Constitution V's "compensating row" pattern: a
match-void cascades to void the consumption (which the existing
void path would symmetrically re-credit stock for) AND void the
transfer.

## Match-void cascade (existing path — verified)

`reverseResultAction` → `reverseResultTx` already voids:

- the `match_agreements.resultRecordedAt` (clears the stamp).
- the `match` row(s).
- the `bet_transfer` rows (via `bet_transfer_voids`).

Spec 018 verifies via integration test that voiding the match
also voids the linked `consumption` rows (via
`consumption_voids`) so the winner's stock + balance return to
pre-match values. If the existing `reverseResultTx` doesn't do
this today, spec 018 adds it.

## Compat note

The existing "find existing winner consumption and transfer it"
mode is REMOVED. No specs reference it externally (it was an
implementation detail of `settleOnePair`). Anyone relying on the
old "transferredCount < requestedCount" partial-settle state was
hitting a latent bug; the new behavior makes the post-condition
deterministic.
