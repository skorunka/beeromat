# Research — Match-bet → home awareness

Phase 0 output for spec 018. Three decisions resolved.

## Decision 1 — Beer-default resolution order

**Decision**: When the match-settle transaction auto-creates the
winner's consumption, the beer type is resolved by this order:

1. The override beer the result-recorder picked in the
   `RecordResultForm` UI (if present, validated against
   `beer_types` for the club + non-archived + `current_stock > 0`).
2. The winner's last-logged beer via spec-017's
   `lastBeerForMember(winnerMemberId, clubId)`, provided it is
   active (`is_archived = false`) AND in stock (`current_stock
   > 0`).
3. The cheapest in-stock beer in the club (lowest
   `unit_price_minor` from `beer_types` WHERE `club_id = $1` AND
   `is_archived = false` AND `current_stock > 0`).
4. If none of the above resolve, the match-settle action MUST
   fail loudly with a new error code (`NO_BEER_IN_STOCK`) and
   roll back the transaction. The match is NOT recorded — the
   admin must restock first.

**Rationale**:
- (1) honors Pavel's request for an override path that doesn't
  defeat the zero-friction default.
- (2) reuses spec-017's helper — no duplication, and the helper
  already handles voided rows + null cases. The constraint
  "active + in stock" prevents inheriting the V5 disabled state
  from the spec-017 home (which would be a contradiction: we
  know the winner can't log the beer they last had, but we're
  about to log it for them).
- (3) deterministic fallback. Cheapest minimises loser cost when
  the system picks for them — small fairness gesture.
- (4) failing loudly beats silently creating a broken match
  (which Jiří would have to clean up).

**Alternatives considered**:
- New `clubs.match_prize_beer_id` admin config (spec input
  Option 2). Rejected: needs admin UI; (1) + (2) cover the
  same need without new schema.
- Always-cheapest (spec input Option 3). Rejected: violates
  "the winner gets their usual" semantics.

## Decision 2 — Doubles split

**Decision**: `clubs.matchLoserBeerCount` (today: dead schema
column, default 1) is interpreted as **the total beers owed by
the losing SIDE per match**, NOT per loser-pair. The
match-settle transaction splits the count across the pairs of
the losing side evenly, with any leftover going to seat1's pair
first.

Algorithm (`lib/match/split-beer-count.ts`):

```text
splitBeerCountAcrossPairs(count: number, numPairs: number): number[]
  // returns array of length numPairs; entry[i] is the beer
  // count for the i-th pair (i=0 is the seat1 pair).

  if numPairs <= 0  → []
  base = Math.floor(count / numPairs)
  extra = count % numPairs
  result = Array.from({length: numPairs}, (_, i) =>
    base + (i < extra ? 1 : 0))
```

Worked examples:
- Singles, count=1 → numPairs=1 → `[1]`.
- Singles, count=2 → numPairs=1 → `[2]`.
- Doubles straight, count=2 → numPairs=2 → `[1, 1]`.
- Doubles straight, count=3 → numPairs=2 → `[2, 1]`.
- Doubles crossed, count=2 → numPairs=2 → `[1, 1]` (same shape;
  pairing-kind only affects who pairs with whom, not the split).

**Rationale**: matches the clarify answer (per losing SIDE, even
with rounding up). A doubles loser side pays the same total as a
singles loser would — fair across format. Seat1 getting the
leftover is conventional (already used by spec-013 for default
"first listed" semantics).

**Alternatives considered**:
- count per losing pair (multiply for doubles). Rejected by user
  in clarify Q3.
- All beers to seat1 (captain-pays). Rejected — feels arbitrary.

## Decision 3 — Replace vs. augment the existing settleOnePair

**Decision**: **Fully replace** the existing "find an eligible
winner consumption and transfer it" logic with "create the
winner's consumption (per Decision 1's resolution) and transfer
it".

**Rationale**:
- Today's `settleOnePair` is "best-effort": if the winner hasn't
  drunk anything in the current open session yet, the bet
  silently doesn't settle (`transferredCount = 0,
  requestedCount = beerCount`). This is exactly the gap the
  panel flagged ("the system knows I lost the match. Why don't
  the rows exist?").
- The two semantics are not compatible — keeping both as
  fallbacks would double-create rows for cases where an
  eligible consumption already existed AND we auto-create one.
- The data model invariant we want is:
  `forBeer match → matchBetTransfer count == matchLoserBeerCount`
  for every settled match. The current behavior makes this
  invariant a hope; the new behavior makes it a constraint.

**Alternatives considered**:
- Keep "find existing" as preferred, auto-create only as
  fallback. Rejected — adds branching complexity and obscures
  the invariant (the recorder doesn't see WHICH path ran for
  WHICH beer).
- Add a feature flag to toggle modes. Rejected — Constitution
  Test/Prod Code Separation forbids test-only branches; a
  feature flag for "old behavior vs new" would be exactly that.

## Cross-cutting confirmations

- **Constitution v1.10.0 Principle VIII**: unit (split helper) +
  integration (transaction) + component (home module + picker)
  layers are right for this spec. No E2E justified — the
  match-settle journey crosses well-tested seams individually.
- **No new dependencies**: everything reuses existing libs.
- **No constitution bumps**: Tech Stack table unaffected.
- **No new env vars or secrets**.
- **Existing match-void path** (`reverseResultAction` →
  `reverseResultTx`) already voids the match + transfers
  atomically; we verify it also voids the auto-created
  consumption rows (the source_consumption_id back-reference is
  followed). One new integration test case covers this end-to-end.
