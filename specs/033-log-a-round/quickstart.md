# Quickstart: Log a round

## What you're building

A multi-select "round" logger on the home Útrata card (under the one-tap log):
pick one beer, tap everyone drinking (you're pre-selected), optionally override
one person's beer, tap once → a beer lands on each drinker's own tab.

## Manual test (dev)

1. `pnpm dev` (port 3010), sign in, open home.
2. Under the one-tap log, expand "Zapsat pro jiného člena" → it's now a round:
   - The beer picker defaults to your usual.
   - Your avatar is pre-selected. Tap three teammates → the button reads
     "Zapsat rundu · 4 piv" and the counter shows 🍺 ×4.
3. (Override) Tap the beer chip on one teammate, pick a different in-stock beer.
4. Tap **Zapsat rundu**. Expect: celebrate animation, a toast, the round breakdown
   on home updates **in place** (no navigation), and the selection resets.
5. Verify on `/tab` (yours) + each teammate's tab: one beer each, correct beer +
   price; stock dropped by 4.
6. Each teammate sees a "Zápisy pro tebe" review item (keep/reject); your own
   beer has none.
7. (Out of stock) Set one beer's stock to 0 (admin), build a round including it,
   submit → the others log, a toast names the skipped person/beer.

## Automated tests

```bash
pnpm test:unit         # round-schema.spec.ts — distinct memberIds, uuid, non-empty
pnpm test:integration  # log-round-action.spec.ts — batched tx, partial skip, review distinction
pnpm test:component     # round-logger.spec.tsx — multi-select, override, submit states
pnpm test               # all of the above + i18n:check + forms:check
```

### Integration cases to cover

- N drinkers (incl. self) → N consumptions on N tabs, correct price, stock −N.
- Self beer → no "logged for you" review row; each teammate → exactly one.
- One beer out of stock → rest logged, skipped reports it; `ok:true`.
- All out of stock → `ok:false code 'ALL_SKIPPED'`, nothing written.
- A memberId from another club / inactive → that item skipped
  `TARGET_NOT_IN_CLUB`, others logged.
- Stock audit: one `consumption_decrement` row per **logged** item only.

### Component cases to cover

- Logger pre-selected; tapping toggles; count + submit label update.
- Submit disabled at 0 drinkers.
- Per-person override changes that drinker's payload; clearing reverts to default.
- Success path: celebrate + toast + reset (action mocked).

## Definition of done

- Gates 1–8 green (`pnpm typecheck`, `lint`, `test:unit`, `test:integration`,
  `test:component`, `build`, `i18n:check`, `forms:check`). No E2E (declared N/A).
- No schema change / migration.
- Shipped to `main` (trunk-based), commits reference task IDs + `US#`.
