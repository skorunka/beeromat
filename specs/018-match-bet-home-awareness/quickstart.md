# Quickstart — verifying spec 018

Manual paths to confirm the match-bet → home awareness loop.

## Prerequisites

- Local Docker stack up (`pnpm docker:up`).
- Dev server running (`pnpm dev`, port 3010).
- At least two members in the club (Pavel + Honza), one
  in-stock beer.

## Verification paths

### 1. Singles "for beer" happy path

1. As Pavel, create a singles match agreement against Honza with
   `forBeer = true`. Go to /match.
2. Open the agreement. Tap "Record result".
3. Note the new optional **beer-picker** — defaulted to your
   last-logged beer (or cheapest in-stock if you have none).
   Submit Honza-wins.
4. Switch to Honza. Open `/`. The home shows a `MatchBetModule`
   row: "Útrata z dnešního zápasu: 1× pivo" + "Vrátit zápas" link.
5. The balance sentence reflects the new tab amount (one beer's
   worth added).
6. Tap "Vrátit zápas" → goes to `/match/{matchId}` where the
   existing reverse-result UI lives.
7. Reverse the result. Honza's balance returns to its pre-match
   value. The MatchBetModule disappears from home.

### 2. Doubles split

1. As Pavel, create a doubles agreement (you + Tereza vs. Honza
   + Standa), straight pairing, `forBeer = true`.
2. Set the club's `matchLoserBeerCount = 3` via
   `/admin/config` (or directly in DB).
3. Record the result with your side winning.
4. As Honza: home shows `MatchBetModule` "Útrata z dnešního
   zápasu: 2× pivo" (he's seat1 → gets the extra).
5. As Standa: home shows "Útrata z dnešního zápasu: 1× pivo".
6. As Pavel + Tereza: home shows no `MatchBetModule` (they're
   the winners; the rows live on their `/tab` but won't show
   the bet module because they're not the `to_member` of any
   transfer).

### 3. Override beer-picker

1. Create a singles agreement; you have multiple beers in the
   catalog (Pilsner, Kozel).
2. Record result. In the beer-picker, change from the default
   ("Pilsner — your last beer") to "Kozel".
3. As the loser: home's `MatchBetModule` says "1× pivo" still
   (the count doesn't expose the beer name — that's by design
   to keep the row short).
4. As the loser: visit `/tab`. The new bet-linked row's beer
   name reads "Kozel" with the "ze zápasu →" subtitle.

### 4. No-beer-in-stock failure

1. As admin, archive every beer type (or set every
   `current_stock = 0`).
2. As Pavel, try to record a "for beer" match result.
3. The action surfaces a Czech error: "Klub nemá na skladě
   žádné pivo — naskladněte před záznamem zápasu". The match
   is NOT recorded (transaction rolled back). The agreement
   stays OPEN. /admin/balances is unchanged.
4. Restock at least one beer; retry; succeeds.

### 5. Match-void cascade

1. As Pavel, record a "for beer" match (singles, count=1) with
   you as the winner.
2. Verify `/tab` (Honza's view) shows the new bet-linked row.
3. Stock-check: the winner's beer `current_stock` decreased by
   1 (auto-create decrements stock, same as `logBeer`).
4. As Pavel (or treasurer), call `reverseResultAction` (UI: the
   "reverse" button on `/match/{matchId}`).
5. Verify the cascade:
   - `match.voidedAt` is set.
   - `bet_transfers` has a `bet_transfer_voids` row for the
     match's transfer.
   - The corresponding `consumption` has a `consumption_voids`
     row.
   - Stock returns to its pre-match level.
   - `/tab` Honza view no longer counts the voided row in his
     balance.

## Verification gates (constitution v1.10.0)

```bash
pnpm typecheck            # green
pnpm lint                 # green
pnpm test:unit            # green; new split-beer-count tests pass
pnpm test:integration     # green; new match-settle-with-bet covers 8 cases
pnpm test:component       # green; new MatchBetModule + beer-picker variants
pnpm build                # green
pnpm i18n:check           # green; new home.matchBet.* + match.bet.* keys present
pnpm forms:check          # green; no native validation introduced
# pnpm test:e2e           # N/A per plan.md
```

## Manual nag-tone audit

```bash
grep -rE "dlu(žíš|žná|žit)|you owe|you must pay" messages/ app/[locale]/\(app\)/ 2>&1
# Expected output: empty.
```
