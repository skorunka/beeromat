# Contract: `logRoundAction` (server action)

**Location**: `app/[locale]/(app)/log/actions.ts` (alongside `logBeerAction` /
`logBeerOnBehalfAction`).

## Signature

```ts
logRoundAction(input: {
  items: { memberId: string; beerTypeId: string }[];
}): Promise<LogRoundResult>

type LogRoundSkip = {
  memberId: string;
  beerTypeId: string;
  reason: 'OUT_OF_STOCK' | 'BEER_NOT_AVAILABLE' | 'TARGET_NOT_IN_CLUB';
};

type LogRoundResult =
  | {
      ok: true;
      logged: { memberId: string; beerTypeId: string; consumptionId: string }[];
      skipped: LogRoundSkip[];
      sessionId: string;
      /** Actor's balance AFTER commit — changes only if the actor was a drinker. */
      balanceAfterMinor: bigint;
    }
  | { ok: false; code: 'EMPTY' | 'ALL_SKIPPED' };
```

## Preconditions

- Caller authenticated + unlocked (`requireUnlocked`).
- `input` parses against `logRoundSchema` (≥1 item, uuid fields, **distinct
  memberIds**). A parse failure is a client bug, not a user path — the UI never
  submits an invalid payload (submit disabled at 0 drinkers; dedupe by avatar
  toggle). The action still validates as the authoritative boundary.

## Behaviour (single transaction)

1. Parse with `logRoundSchema`. Empty → `{ ok:false, code:'EMPTY' }`.
2. Get-or-open the club's single open `drink_session` (race-safe, once).
3. For each item, in order:
   a. Verify `memberId` is an **active member of the actor's club**; else push to
      `skipped` (`TARGET_NOT_IN_CLUB`) and continue.
   b. Verify `beerTypeId` is in the club + not archived; else `skipped`
      (`BEER_NOT_AVAILABLE`).
   c. Atomic conditional decrement of that beer's stock; no row → `skipped`
      (`OUT_OF_STOCK`).
   d. Insert a `stock_changes` audit row (`delta -1`,
      `kind 'consumption_decrement'`).
   e. Insert a `consumptions` row: `member_id = item.memberId`,
      `created_by_user_id = actor`, price snapshot, the session id. Push to
      `logged`.
4. If `logged` is empty → return `{ ok:false, code:'ALL_SKIPPED' }` (the
   transaction commits nothing material; skipped items wrote nothing).
5. `revalidatePath('/')`, `'/log'`, `'/tab'`.
6. After commit, read the actor's balance → `balanceAfterMinor`.

## Postconditions

- Exactly `logged.length` consumption rows exist, one per distinct drinker, each
  on that drinker's own tab, each with a price snapshot + a stock audit row, with
  stock reduced by `logged.length`.
- The actor's own beer (if present) produces no "logged for you" review; each
  teammate's beer produces exactly one (existing review machinery — no new code).
- No partial-tab corruption: items either fully logged or fully skipped; the
  whole batch shares one session and commits together.

## Error/edge matrix

| Situation | Result |
|---|---|
| 0 items (schema) | `{ ok:false, code:'EMPTY' }` |
| all items out of stock / unavailable / not-in-club | `{ ok:false, code:'ALL_SKIPPED' }` |
| some items unavailable | `{ ok:true, logged:[…], skipped:[…] }` |
| duplicate memberId | rejected by `logRoundSchema` before the action body |
| no open session | one is auto-opened (existing behaviour), then the batch proceeds |

## Idempotency / concurrency

- Not idempotent (logging a round twice logs two rounds — same as tapping log
  twice). The UI guards double-submit with the pending transition state.
- Stock decrements are race-safe (conditional `WHERE current_stock > 0`); two
  concurrent rounds competing for the last beer → exactly one wins that item, the
  other gets `OUT_OF_STOCK` in `skipped`.
