# Quickstart / Manual Verification: Admin Data Correction

Sign in as a `club_admin`. (Use a dev club with some test data: log a few
beers for a member, confirm a payment, play a match.)

## US1 — Void any consumption

1. Go to **Admin → Balances → [member]**. The detail now lists the member's
   consumptions across all sessions (not just the open one), each with a void
   control.
2. Void an **unpaid** beer → confirm dialog → the member's balance drops by
   that beer's price; the row shows as voided; stock for that beer +1.
3. Void a beer that was already covered by a **confirmed payment** → the
   member's balance goes **into credit** (negative / "máš u nás přeplatek").
4. Try to void the same row again → "already voided", nothing changes.

## US2 — Reverse a confirmed payment

1. On the same member-detail page, find the **confirmed payments** list.
2. Reverse one → confirm dialog → the member's owed balance **rises** by the
   payment amount; the payment shows reversed.
3. Reverse it again → "already reversed", no change.

## US3 — Match/bet correction (reuse existing /match)

1. As admin, open a recorded match on **/match** and reverse it (or cancel an
   open agreement); confirm the related charges/IOUs unwind with no
   half-settled state.

> The club-wide "reset everything" action was descoped — clear test data
> record-by-record via US1 + US2 above.

## Invariant spot-check

After any US1/US2 action, open **Admin → Balances** and confirm the member
list totals still reconcile (no member stuck in an impossible state).

## Gates

`pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test:integration`
· `pnpm test:component` · `pnpm build` · `pnpm i18n:check` ·
`pnpm forms:check` — all green. (E2E N/A — see plan.md test-layer
declaration.)
