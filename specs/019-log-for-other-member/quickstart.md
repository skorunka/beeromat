# Quickstart — verifying spec 019

Manual verification paths after implementation.

## Prerequisites

- Docker stack up (`pnpm docker:up`).
- Dev server running (`pnpm dev`, port 3010).
- Club seeded with at least two active members (Pavel + Honza)
  and a beer in stock.

## Paths

### 1. On-behalf log happy path

1. Sign in as Pavel; open `/`.
2. Below the one-tap log button, tap "Zapsat pro jiného člena".
3. Pick "Honza" from the member picker.
4. Pick a beer (default = Honza's last beer or cheapest in
   stock).
5. Tap "Zapsat". Toast: "Zapsáno: Kozel pro Honzu".
6. Verify: a `consumptions` row exists with `member_id = Honza`,
   `created_by_user_id = Pavel`.
7. Switch to Honza; open `/`. Home shows the review banner:
   "Pavel ti zapsal: Kozel" with [Vrátit] [Nechat].

### 2. Honza keeps the log

1. From step 7 above, tap "Nechat".
2. Banner disappears. The consumption stays on Honza's tab.
3. Verify: `consumptions.on_behalf_reviewed_at` is non-null for
   the row.

### 3. Honza rejects the log

1. From step 7 above (in a fresh state), tap "Vrátit".
2. Toast confirms. Banner disappears.
3. Verify: `consumption_voids` row created; stock restored;
   Honza's balance returns to pre-log value.

### 4. /tab row distinction

1. Set up Honza with: 2 self-logged beers + 1 on-behalf beer
   from Pavel + 1 lost-bet beer (have Pavel record a match
   result against Honza for-beer = true).
2. As Honza, open `/tab`. Verify:
   - 2 rows with no badge (self-logs).
   - 1 row with "od Pavel" subtitle (on-behalf).
   - 1 row with "z prohrané sázky: Pavel · Kozel" + link to
     match (bet loss).
3. Total balance = sum of all 4 row prices.

### 5. Affordance hidden when club has only one member

1. Set up a club with only the signed-in member as active.
2. Open `/`. The "Zapsat pro jiného člena" link is hidden (or
   shows an empty-state message).

## Verification gates (constitution v1.10.0)

```bash
pnpm typecheck            # green
pnpm lint                 # green
pnpm test:unit            # green
pnpm test:integration     # green; new log-on-behalf-tx + tab-entries-merged specs
pnpm test:component       # green; new banner + form + tab-row variants
pnpm build                # green
pnpm i18n:check           # green; new home.onBehalfReview.* + tab.byOther + tab.fromBet
pnpm forms:check          # green
# pnpm test:e2e           # N/A per plan.md
```

## Nag-tone audit

```bash
grep -rE "dlu(žíš|žná|žit)|you owe|you must pay" messages/ app/[locale]/\(app\)/ 2>&1
# Expected output: empty.
```
