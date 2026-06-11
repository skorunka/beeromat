# Server-Action Contracts: Admin Data Correction

All actions: `'use server'`, club-scoped via `requireRole`, return a
discriminated `{ ok: true, ... } | { ok: false, code }` result (project
convention). No throws across the boundary except genuine 500s.

## US1 — Void any consumption (REUSE, possibly widen authz)

`voidConsumptionAction({ consumptionId: string }): Promise<VoidResult>`
(existing — `app/[locale]/(app)/log/actions.ts`)

- **Authz**: logger within undo window OR an **override role**. This feature
  REQUIRES `club_admin` to be an override role with NO age/settled gate.
  Verify; widen the override set if `club_admin` is missing.
- **Behaviour**: inserts `consumption_voids`, restores stock, drops the
  charge. Voiding a settled consumption pushes the member into credit
  (expected).
- **Results**: `{ ok: true }` | `{ ok:false, code:'ALREADY_VOIDED' }` |
  `{ ok:false, code:'FORBIDDEN' }` | `{ ok:false, code:'NOT_FOUND' }`.
- **Idempotent**: second void → `ALREADY_VOIDED`, no change.
- **Bet entanglement**: voiding a bet-originated consumption keeps the paired
  legs consistent (verify against the existing bet-transfer void path).

## US2 — Reverse a confirmed payment (REUSE, surface in admin UI)

`voidConfirmedPaymentAction({ paymentId, reason? }): Promise<ReasonedResult>`
(existing — `app/[locale]/(app)/admin/pending/actions.ts:149`)

- **Authz**: `club_admin` (+ treasurer per existing), club-scoped.
- **Behaviour**: `confirmed → voided` via `payment_state_transitions`;
  member's owed balance rises by the payment amount.
- **Results**: `{ ok:true }` | `{ ok:false, code:'ALREADY_VOIDED' }` |
  `{ ok:false, code:'NOT_FOUND' }` | `{ ok:false, code:'FORBIDDEN' }`.
- **Surface**: list the member's `confirmed` payments on the admin
  member-detail with a "reverse" control (confirm dialog).

## US3 — Match/bet corrections (REUSE existing /match surfaces)

No new action. Match results reverse via `reverseResultTx` and agreements
cancel via `cancelAgreementTx` / `voidBeerDebtTx`, already reachable from
`/match` for users with the right role. This story only verifies a
`club_admin` can reach those corrections; widen authz only if a gap is found.

## Descoped

`resetClubDataAction` / `resetClubOperationalDataTx` (a club-wide
operational-data wipe) were **removed from scope 2026-06-11** at the user's
request — admins clear test data record-by-record via the actions above.

## Validation schemas (Zod, shared client+server)

- Reuse existing `voidConsumption` / confirmed-payment schemas; add only what
  the admin surfaces need (likely none beyond reusing the existing ones).
