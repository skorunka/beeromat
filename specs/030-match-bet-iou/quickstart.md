# Quickstart: Deferred match-bet settlement (beer IOU)

Manual walkthrough to verify spec 030 end-to-end (dev app at
`http://localhost:3010`, two members; Docker browser per the dev-login memory).

## Happy path — win, see the IOU, deliver it

1. **Create a for-beer match.** `/match` → "+ Nový zápas". Pick a format + players,
   leave "🍺 Ano". **A beer picker appears** — pick e.g. "Pilsner Urquell"; the
   dropdown closes immediately on tap. Create.
2. **Record the result.** Open the match, tap the winning side. There is **no beer
   picker here anymore**. Heading reads **"Vítěz: {name}"** (singles) / **"Vítězové:
   {names}"** (doubles).
3. **No money moved.** Check `/tab` and the header balance for both players — unchanged.
   The breakdown shows nothing new.
4. **Both see the IOU.** As the **winner**, home shows **"Dluží ti pivo — {loser}"**;
   as the **loser**, home shows **"Dlužíš pivo — {winner}"**. `/match` →
   **"Sázky k vyrovnání"** lists it for both, each with a **"Předáno"** button.
5. **Deliver.** As either party, tap **"Předáno"**. The planned beer (Pilsner) is
   pre-filled; optionally override to another in-stock beer (dropdown closes on select).
   Confirm.
6. **Money booked once.** The **loser's** /tab now shows the beer's charge; balance
   rose by exactly that price. The **winner's** /tab shows a struck-through (non-
   counting) won-bet row; their balance is unchanged. Stock dropped by one. The IOU is
   gone from "Sázky k vyrovnání".

## Edge checks

- **Friendly match**: create with "Přátelák" → no beer picker; record result → no IOU
  created, nothing to settle.
- **Doubles**: a doubles for-beer match creates **two** IOUs (per the pairing); settle
  one and confirm the other stays pending.
- **Double-tap**: open the same IOU on two tabs, tap "Předáno" twice → charged once;
  second tap shows "Tahle sázka už je vyrovnaná."
- **Out of stock**: archive/zero the planned beer, then deliver → planned beer not
  selectable; pick another in-stock beer to proceed.
- **Reverse while pending**: record a for-beer result, then reverse/cancel the match
  before delivering → the IOU disappears for both, **no** balance/stock change.
- **Reverse after delivery**: deliver, then reverse → the booked charge unwinds (loser's
  balance returns), via the existing transfer-void path.
- **Casual box gone**: `/match` has **no** "Pití, co si můžeš vzít / Beru si ho"
  section anywhere.

## Gate checklist (before commit)

- `pnpm typecheck`, `pnpm lint`
- `pnpm test:unit` (winner-label formatter, debt predicates)
- `pnpm test:integration` (recordResultTx → debts/no-money; deliverBeerDebtTx →
  booked once/idempotent/override/out-of-stock; reverse-pending vs reverse-settled;
  balance invariant after delivery)
- `pnpm test:component` (home IOU module, match-hub list, deliver control, create-form
  beer picker)
- `pnpm build`, `pnpm i18n:check` (new keys present cs+en, casual keys removed),
  `pnpm forms:check`
- No `pnpm test:e2e` (declared N/A in plan.md)
