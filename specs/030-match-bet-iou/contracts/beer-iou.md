# Contracts: Deferred match-bet settlement (beer IOU)

Server actions, transactions, and queries. All actions return a discriminated
`{ ok: true, ... } | { ok: false, code, ... }` result (existing project pattern) and
re-validate club scope + authz server-side.

## 1. Create — store the planned beer

### `createAgreementAction` / `createAgreementTx` (MODIFIED)

Add an optional `betBeerTypeId` to the input.

```ts
// lib/validation/match-agreement.ts — createAgreementSchema gains:
betBeerTypeId?: string | null   // required-ish when forBeer (UI-enforced), null otherwise
```

- When `forBeer === true`, the create form sends the chosen beer's id; `createAgreementTx`
  writes it to `match_agreements.bet_beer_type_id`.
- When `forBeer === false`, `betBeerTypeId` is ignored / null.
- Server validates the beer belongs to the caller's club and is not archived.
- Error codes unchanged + `BEER_NOT_AVAILABLE` if the picked beer is cross-club/archived.

## 2. Record result — create pending debts, no settlement

### `recordResultTx` (MODIFIED)

Inputs unchanged (`agreementId`, `winningSide`, recorder). Behaviour change:

- Still validates OPEN, computes pairs (`computePairs`), writes `matches` rows
  (winner/loser per pair) — **history unchanged**.
- **Remove** the for-beer settlement block (no consumption, no `bet_transfer`, no
  stock decrement, no session open at record time).
- **Add**: when `agreement.forBeer`, insert one `match_bet_debts` row per pair:
  `from = loser`, `to = winner`, `planned_beer_type_id = agreement.bet_beer_type_id`,
  `beer_count = club.matchLoserBeerCount`, `status = 'pending'`, `match_id`,
  `agreement_id`, `created_by`.
- Stamp `resultRecordedAt/By/winningSide` with the same optimistic lock; double-submit
  still returns `ALREADY_RECORDED`.
- Return shape: drop `transferred/requested` counts; return `debtsCreated: number`.

### `recordResultAction` (MODIFIED)

- Drop the `betBeerOverrideId` parameter (the result form no longer picks a beer).
- Result: `{ ok: true, debtsCreated } | { ok: false, code }`.

## 3. Deliver — settle one IOU

### `deliverBeerDebtAction(input)` (NEW)

```ts
input = { debtId: string; beerTypeId?: string | null }  // override; null/absent → planned/fallback
result =
  | { ok: true }
  | { ok: false, code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_SETTLED'
        | 'OUT_OF_STOCK' | 'BEER_NOT_AVAILABLE' }
```

Authz: caller MUST be `from_member` or `to_member` of the debt, OR treasurer/club_admin
of the debt's club. Club-scoped lookup.

### `deliverBeerDebtTx` (NEW)

1. `SELECT … FOR UPDATE` the debt; if `status <> 'pending'` → `ALREADY_SETTLED` (no write).
2. Resolve beer: `override → planned_beer_type_id → pickBetBeer` fallback chain
   (`lib/match/default-bet-beer.ts`). Validate club + not archived → `BEER_NOT_AVAILABLE`.
3. Ensure an open drink session for the club (same as logging a beer).
4. For `beer_count` iterations, run the existing `settleOnePair` body: decrement stock
   (→ `OUT_OF_STOCK` if insufficient), insert winner consumption, insert `bet_transfer`
   (`from = winner`, `to = loser` — i.e. cost moves winner→loser), insert
   `match_bet_transfers (match_id, bet_transfer_id)`.
5. Stamp the debt: `status = 'settled'`, `settled_at`, `settled_by_user_id`,
   `settled_beer_type_id`.

Money direction note (unchanged from today): the **winner** gets the auto consumption
(they drank), the `bet_transfer` moves its cost so the **loser's** balance rises. After
delivery the loser sees a charge on /tab; the winner sees a struck-through (non-counting)
won-bet row — identical rendering to today's `tab-entry-row`.

## 4. Reverse / cancel

### `cancelAgreementTx` / reverse path (MODIFIED)

- For each `pending` debt of the agreement → set `status = 'voided'`, `voided_at/by`.
  No money/stock change.
- For each `settled` debt → leave the debt row; void the linked `bet_transfer`s (via
  `bet_transfer_voids`) and their consumptions, using the **existing** void path keyed
  off `match_bet_transfers` for the agreement's `matches` rows. (This is what today's
  reverse already does for the auto-settled transfers.)

## 5. Queries

### `listBeerDebtsForMember({ clubId, memberId })` (NEW) — `lib/db/queries/match-bet-debts.ts`

Returns the member's **pending** debts in both directions for display:

```ts
{
  owedToMe: Array<{ debtId; counterpartyMemberId; counterpartyName; counterpartyAvatar…;
                    beerTypeName | null; beerCount; agreementId; createdAt }>,  // to_member = me
  iOwe:     Array<{ … same shape … }>,                                          // from_member = me
}
```

- Club-scoped; joins members (names/avatars) + beer_types (planned name).
- Powers the home module and the `/match` "Sázky k vyrovnání" list.

### `matchBetSummaryForMember` (MODIFIED) — `lib/db/queries/match-bet-summary.ts`

- Replace the won/lost **transfer** counts (which only existed because settlement was
  instant) with **pending-debt** counts (owed-to-me / I-owe) for the home headline.
- Settled history still surfaces via the existing tab/transfer queries (unchanged).

## 6. Removals

- `app/[locale]/(app)/bet/actions.ts` `createBetTransferAction` — DELETE (casual claim).
- `components/bet/transfer-list.tsx` casual "drinks you can take" + "Beru si ho" — DELETE
  (the file may be removed if nothing else uses it; `getBetTransfersForSession` stays for
  history detail).
- `RecordResultForm` bet-beer tile picker (spec 025) — REMOVE (beer now at create/delivery).
- `messages/*.json` casual `bet.drinksYouCanTake / transferToMe / noOtherDrinks / subtitle`
  (the "Vezmi si na svou útratu…" string) — REMOVE from both catalogs.

## 7. New i18n keys (cs + en, Czech-first)

| Key (namespace) | cs | en |
|---|---|---|
| `matchBet.oweBeer` | "Dlužíš pivo — {name}" | "You owe {name} a beer" |
| `matchBet.owedBeer` | "Dluží ti pivo — {name}" | "{name} owes you a beer" |
| `matchBet.deliver` | "Předáno" | "Delivered" |
| `matchBet.deliverConfirm` | "Předat {beer} pro {name}?" | "Hand over {beer} to {name}?" |
| `matchBet.settledToast` | "Vyrovnáno — {beer} na útratě {name}." | "Settled — {beer} on {name}'s tab." |
| `matchBet.alreadySettled` | "Tahle sázka už je vyrovnaná." | "That bet is already settled." |
| `match.toSettleHeading` | "Sázky k vyrovnání" | "Bets to settle" |
| `match.winnerSingular` | "Vítěz: {name}" | "Winner: {name}" |
| `match.winnerPlural` | "Vítězové: {names}" | "Winners: {names}" |
| `match.betBeerLabel` | "O jaké pivo?" | "For which beer?" |

(Counts/plurals via ICU where needed; exact keys finalized in tasks.)
