# Contracts: UX Backlog Completion (v1.3)

v1.3 exposes no new Server Action and no new HTTP interface. Its contracts
are (1) the new **screens**, (2) the **`getPaymentHistory`** read query, and
(3) the **behaviour** of the refined existing surfaces. Every v1 Server
Action contract (`specs/001-beer-consumption-ledger/contracts/`) is unchanged.

---

## 1. New screens

### `/account` — member account hub (US4)

- Reached by tapping the home-screen greeting.
- Shows the member's display name, a link to **`/account/payments`**, and a
  **sign-out** control.
- Sign-out invokes the existing `signOutDeviceAction` (no new action): it
  ends the Better-Auth session and the device session, then lands the member
  on the signed-out entry point. A protected screen visited afterwards
  requires a fresh sign-in (FR-010/FR-011).

### `/account/payments` — member payment history (US1)

- Renders the signed-in member's own payment timeline from
  `getPaymentHistory`, most-recent-first.
- Each row shows: amount (formatted via `Intl` for the club locale), date,
  and a **state badge** — pending / confirmed / disputed; a disputed row also
  shows the dispute reason.
- Empty state: a friendly, localized message when the member has no payments
  (FR-004).
- A member sees only their own payments (FR-003).

---

## 2. `getPaymentHistory` read query

Implemented in `lib/db/queries/payments.ts` per the v1 contract
(`specs/001-beer-consumption-ledger/contracts/payments.md` → `Q
getPaymentHistory`). Contract honoured:

- **Role**: callable by a member for their own data — v1.3 scopes it to
  `ctx.member.id` (the treasurer/club-wide variant is out of v1.3 scope).
- **Returns**: an ordered (most-recent-first) page of the member's payments
  with the fields in `data-model.md` → "Returned shape".
- **Read-only**: no writes, no state transitions.
- It is a *query*, not a Server Action — building it adds no action and
  changes no contract (FR-018).

---

## 3. Refinement behaviour contracts

| # | Surface | Behaviour | Source |
|---|---------|-----------|--------|
| R1 | Beer-type row | Restock is the visually dominant action; Adjust / Edit / Archive / History are visibly secondary. | FR-005 |
| R2 | Stock-adjust form | Collects a positive quantity + an Add-stock / Remove-stock choice; **no signed-number field**. The form computes the signed delta and calls the unchanged `recordStockAdjustmentAction`. | FR-006, FR-008 |
| R3 | Stock-adjust (Remove) | A Remove exceeding current stock is rejected in-app via `FormRootError` (the action's `WOULD_GO_NEGATIVE`); removing exactly to zero is allowed; no change is recorded on rejection. | FR-007 |
| R4 | Home screen | After a log or an undo, the outstanding balance reflects the change without a manual revisit (the log/undo actions revalidate `/`). | FR-009 |
| R5 | Log screen | With no beer types, shows a friendly localized empty state consistent in tone with the history/balances empty states. | FR-012 |
| R6 | Dispute banner | Includes an actionable link (to Settle) in addition to the explanation; the banner is not shown once the payment leaves the disputed state. | FR-013, FR-014 |
| R7 | Money-amount inputs | Show helper text stating the accepted amount format, via the `FormDescription` primitive, in the active locale. | FR-015 |
| R8 | Bet screen | Shows the member a running tally of their bet transfers for the open session, distinct from the home balance figure; no "0 transfers" clutter when there are none. | FR-016 |

All refined surfaces keep: catalog-sourced strings (`i18n:check`),
no native form validation (`forms:check`), and ≥44 px controls.

---

## 4. Acceptance → verification mapping

Every spec acceptance scenario maps to an automated check (SC-008):

| Spec scenario | Verified by |
|---------------|-------------|
| US1 1–5 (payment history) | E2E `ux2-payment-history.spec.ts` — mixed-state payments appear with amount/date/state; empty state; locale; own-payments-only |
| US2 1–4 (stock UI) | E2E `ux2-stock-friendlier.spec.ts` — Restock dominant; add/remove (no signed field); over-draw rejected in-app; recorded delta matches v1 |
| US3 1–2 (home balance) | E2E `ux2-home-balance.spec.ts` — balance rises after a log, drops after an undo |
| US4 1–2 (sign-out) | E2E `ux2-sign-out.spec.ts` — control present; sign-out ends the session |
| US5 1–2 (empty state / banner) | E2E `ux2-guidance.spec.ts` — log empty state; dispute banner action link |
| US6 1–2 (helper text / bet tally) | E2E `ux2-polish.spec.ts` — money helper text; bet-transfer tally visible |
| FR-017 (catalogs) | `i18n:check` — all v1.3 keys resolve in both catalogs |
| FR-019 (forms standard) | `forms:check` — the adjust form introduces no native validation |
