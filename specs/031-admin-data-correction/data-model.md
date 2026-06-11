# Data Model: Admin Data Correction

Most of this feature reuses existing tables. The only schema addition is an
audit row for the club-wide reset.

## Existing entities (reused, no schema change)

### consumptions / consumption_voids
- A consumption is voided by inserting a `consumption_voids` row
  (`consumptionId`, `voidedByUserId`, `voidedAt`, `reason`) — never deleted.
- Voiding restores stock (a `stock_changes` `consumption_void_increment` row)
  and drops the charge from the member's balance.
- **US1 change**: admin may void at any age/settled state (override role);
  no new columns.

### payments / payment_state_transitions
- Status lifecycle: `claimed → confirmed`, `claimed → disputed`, and
  `confirmed → voided` (reversal). Each change appends a
  `payment_state_transitions` row (`paymentId`, `fromStatus`, `toStatus`,
  `actorUserId`, `reason`, `createdAt`).
- **US2 change**: admin reverses a `confirmed` payment → `voided` transition
  (existing `voidConfirmedPaymentAction`); balance owed rises back. No new
  columns.

### match-bet / match-agreement records (US3 completeness)
- Already correctable via existing `/match` paths (`reverseResultTx`,
  `cancelAgreementTx`, `voidBeerDebtTx`). No schema change; this story only
  ensures admin reach.

## New entities

**None.** The feature reuses existing tables only. (The club-wide reset and
its `club_data_resets` audit table were descoped 2026-06-11.)

## Invariants

- **Balance-aggregation invariant** (Principle V + memory
  `project_balance_aggregation_invariant`): after any void/reverse, every
  per-member balance = Σ(non-voided own consumptions) + bet-transfer legs −
  Σ(confirmed payments).
- **Club isolation**: no operation reads or writes rows of another club; an
  integration test asserts a second club is untouched.
- **Idempotent corrections**: voiding an already-voided consumption or
  reversing an already-voided payment is a no-op that reports the existing
  state (ALREADY_VOIDED), changing nothing.
