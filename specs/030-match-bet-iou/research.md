# Research: Deferred match-bet settlement (beer IOU)

Phase 0 decisions. All five product questions were resolved with the user before
the spec; this file records the *technical* decisions + rationale.

## D1 — Separate `match_bet_debts` table vs. a "pending" flag on `bet_transfers`

**Decision**: New `match_bet_debts` table; `bet_transfers` stays exactly as-is and
is created only at delivery.

**Rationale**: A `bet_transfer` requires a `source_consumption_id` (NOT NULL) — it
moves the cost of an *existing* consumption. In the deferred model there is no
consumption until delivery, so a transfer literally cannot exist while the debt is
pending. A dedicated debt row cleanly holds the obligation (who/whom/which beer/how
many) and then *materialises* into the existing consumption + transfer at delivery.
This also leaves the entire balance/tab/breakdown machinery untouched — it already
understands transfers; pending debts are simply invisible to it.

**Alternatives considered**: (a) make `source_consumption_id` nullable + a status on
`bet_transfers` — rejected: pollutes the money-movement table with a non-money state,
forces every balance/tab query to learn a new "pending" exclusion, risks the
balance invariant. (b) Pre-create the winner's consumption at record time and only
defer the transfer — rejected: that books stock + a (free) consumption immediately,
which is exactly the "money moved without anyone asking" confusion we're removing.

## D2 — Where the planned beer lives

**Decision**: Add `bet_beer_type_id` (nullable FK → `beer_types`) to
`match_agreements`, set at create when `forBeer`. Each debt copies it as its planned
beer at record time; delivery can override.

**Rationale**: The beer is an attribute of the *agreement* (the whole match is "for a
Pilsner"), chosen once at create. Copying onto each debt at record time keeps the
debt self-contained for the deliver step and lets doubles' two debts diverge if ever
needed. Nullable because friendly matches have no beer and because an older agreement
created before this column won't have one (delivery falls back to the existing
`pickBetBeer` chain).

## D3 — Who may mark delivered

**Decision**: Either participant of the debt (loser or winner) **or** a treasurer/
club_admin. Server re-validates membership in the debt or elevated role.

**Rationale**: User decision — trust-based pet app, "one of them clicks delivered".
Treasurer/admin inclusion mirrors existing match-result permissions (a treasurer can
record/cancel results) and helps fix-ups.

## D4 — Beer chosen/overridable at delivery, reusing settlement

**Decision**: Delivery reuses the existing `settleOnePair`-style logic
(`lib/match/default-bet-beer.ts` `pickBetBeer` for the default; create winner
consumption + `bet_transfer` winner→loser + `match_bet_transfers` link), with the
beer resolved as: explicit override → debt's planned beer → existing fallback chain.
Out-of-stock beers are not selectable; stock is decremented in the same tx.

**Rationale**: Reusing the audited settlement path is what guarantees the balance
invariant (`effectiveConsumptionTotal` == Σ countable tab entries) continues to
hold. We are changing *when* and *which beer*, not *how the money is represented*.

## D5 — Idempotency / double-delivery race

**Decision**: `deliverBeerDebtTx` re-reads the debt `FOR UPDATE` (or an optimistic
guard on `status = 'pending'`) inside the tx; if it's not pending, return an
`ALREADY_SETTLED` typed result and write nothing. Mirrors the existing
`recordResultTx` optimistic-lock pattern (which already returns `ALREADY_RECORDED`
on double-submit).

**Rationale**: Two people tapping "Předáno" at the bar is realistic; the cost must be
booked exactly once.

## D6 — Reverse / cancel handling

**Decision**: Cancelling/reversing an agreement whose debts are still **pending**
marks those debts `voided` (status transition, audit fields) and moves nothing.
After a debt is **settled**, reversal voids the created `bet_transfer` via the
existing `bet_transfer_voids` path (and the auto-created consumption via its existing
void), exactly as today.

**Rationale**: Constitution V — no hard deletes; a `voided` status is the
compensating state. Reversing-while-pending is now strictly simpler than today (no
money to unwind), which is a side benefit.

## D7 — Beer count per debt

**Decision**: `beer_count` column on the debt, sourced from the club's existing
`matchLoserBeerCount` setting (default 1); one debt per pair. Delivery settles the
debt **in full** (creates `beer_count` consumptions + transfers of the chosen beer).
Partial delivery is out of scope.

**Rationale**: Preserves current "loser buys N beers" semantics while keeping the
"owes you a beer" mental model (default N=1). Per-pair single debt keeps the list
short and the deliver action one decision (one beer type for the whole debt).

## D8 — Remove the casual bet surface

**Decision**: Delete `app/[locale]/(app)/bet/actions.ts` `createBetTransferAction`
and the "Pití, co si můžeš vzít / Beru si ho" UI (`components/bet/transfer-list.tsx`
casual section + its strings). The match hub renders pending IOUs instead.

**Rationale**: User decision — it overlaps confusingly with match bets and there is
now one coherent bet concept. Keep `getBetTransfersForSession` (history detail still
shows settled transfers) but drop the manual-claim creation path.

## D9 — Testing layers

**Decision**: unit + integration + component; no E2E (rig dormant). See plan.md Test
layer declaration. Integration is the centre of gravity because the value + risk live
in the two transactions (record → debts, deliver → money).

## D10 — Migration

**Decision**: One Drizzle migration: `ALTER TABLE match_agreements ADD COLUMN
bet_beer_type_id` + `CREATE TABLE match_bet_debts` (+ enum + indexes + checks).
Generated via `drizzle-kit generate`, applied via the project's migrate path.
Existing 012-era matches and pre-030 agreements are unaffected (nullable column,
new table starts empty).
