# Research: Admin Data Correction

## Decision 1 — Reuse existing void/reverse actions for US1 & US2

**Decision**: Do NOT write new deletion logic for per-record corrections.
Reuse:
- `voidConsumptionAction` (`app/[locale]/(app)/log/actions.ts:302`) — already
  voids a consumption via `consumption_voids` (compensating row + stock
  restore) and already permits an **override role** to void past the
  member's undo window (spec 019; integration test: "stock_manager can void
  past the window").
- `voidConfirmedPaymentAction` (`app/[locale]/(app)/admin/pending/actions.ts:149`)
  — reverses a confirmed payment through the `payment_state_transitions`
  machine. This is the exact action Constitution Principle V cites as
  "fully implemented in the action layer but reachable from no screen."

**Rationale**: These are the audited, invariant-preserving mechanisms the
constitution mandates (compensating rows, not UPDATE/DELETE). Reusing them
means US1/US2 are surfacing + authz-widening, not new money logic — far
lower risk to the balance invariant.

**Work implied**:
- Confirm `voidConsumptionAction`'s override-role set includes `club_admin`
  (and that "settled/old" is not separately blocked — voiding is
  age-agnostic; the only gate is the override role). Widen if needed.
- Confirm `voidConfirmedPaymentAction` is `club_admin`-gated and club-scoped.
- Surface both in the admin member-detail view.

**Alternatives considered**: New admin-only `adminVoidX` actions — rejected
as duplication of audited paths and a second place for invariant bugs to hide.

## Decision 2 — Broaden the admin member-detail to all-time records

**Decision**: `getMemberTabForAdmin` currently returns only the **open
session's** entries and sets `canUndo:false` (no affordance). To void *any*
consumption "regardless of age", the admin member-detail must list the
member's consumptions across all sessions (or at least all non-voided ones)
and expose a void control per row. Add a confirmed-payments list to the same
page for the reverse control.

**Rationale**: FR-001 requires voiding old/settled consumptions; today they
aren't even shown to the admin (they live in the member's own `/history`).

**Alternatives considered**: Add void controls to the member's `/history`
view — rejected; that's the member's surface, and admin correction belongs
in the admin area. Paginate if volume grows — deferred (single club, low
volume).

## Decision 3 — Club-wide reset: DESCOPED

The original plan included a prod-safe `resetClubOperationalDataTx` +
type-to-confirm danger zone. **Removed 2026-06-11 at the user's request** —
they want surgical, direct per-record control, not a clean-slate nuke. Test
data is cleared record-by-record via Decisions 1–2. This removes the only
hard-delete path, so Constitution Principle V now passes cleanly with no
Complexity-Tracking justification needed.

## Decision 4 — Credit & payment-reversal semantics (from spec Assumptions)

**Decision**: Voiding a paid consumption leaves the member in credit
(negative balance), surfaced via the existing credit display; no auto-refund.
Reversing a confirmed payment moves it to the existing terminal void state
via `payment_state_transitions`; the cash is assumed test/refunded
out-of-band. No clarification needed — both have a clear sensible default and
were recorded in the spec's Assumptions.
