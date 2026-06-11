# Feature Specification: Admin Data Correction

**Feature Branch**: `031-admin-data-correction` (authored on `main` — trunk-based)

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "As admin I must be able to make direct data changes — delete this or that record — on my own responsibility, to keep the numbers consistent. E.g. the treasurer tested the app (drank beers, confirmed a payment) and that test data must not skew real balances later." (Scope clarified 2026-06-11: **surgical per-record corrections only — NOT a club-wide reset.**)

**Note on "delete"**: removal is implemented as an auditable void — the record stops counting toward any balance and reads as removed, but is preserved in the trail (who removed it, when). The admin gets the outcome they want ("it's gone from the numbers") while the books remain explainable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Void an erroneous or test consumption (Priority: P1)

A club admin reviewing a member's tab finds a beer that was logged in error (a test entry, a double-tap, the wrong member) and removes it so it no longer counts toward anyone's balance — **even if that beer was logged days ago or has already been paid for**. The removal is recorded (who removed it, when) so the books still explain themselves.

**Why this priority**: This is the most common correction and the core of the request. Members' balances are only trustworthy if a clearly-wrong charge can be removed. Today the member-self undo is time-boxed and there is no admin path for older or settled entries.

**Independent Test**: As admin, void a specific consumption on a member's balance detail view; confirm the member's owed total drops by that beer's price, the beer's stock is returned, and the voided entry is marked (not silently deleted) with the admin as the actor.

**Acceptance Scenarios**:

1. **Given** a member has an unpaid consumption of 45 Kč, **When** the admin voids it, **Then** the member's balance decreases by 45 Kč and the consumption shows as voided with the admin recorded as who voided it.
2. **Given** a consumption that was already covered by a confirmed payment, **When** the admin voids it, **Then** the member's balance goes into credit by that amount (they have effectively overpaid) and the credit is visible on their balance.
3. **Given** a consumption that is already voided, **When** the admin attempts to void it again, **Then** the system reports it is already voided and changes nothing.
4. **Given** a beer that was won/lost as part of a match bet (a transferred charge), **When** the admin voids it, **Then** the related bet legs are unwound consistently so no half-settled state remains.

---

### User Story 2 - Reverse a wrongly-confirmed payment (Priority: P1)

A club admin sees a payment that was confirmed by mistake (a test, or confirmed before the money actually arrived) and reverses it, so the member once again owes what they really owe.

**Why this priority**: The user's concrete example includes a confirmed test payment. A confirmed payment that can never be undone permanently corrupts a member's balance.

**Independent Test**: As admin, reverse a confirmed payment on a member's balance detail view; confirm the member's owed total increases by the payment amount and the payment shows as reversed/voided with the admin recorded and a timestamp.

**Acceptance Scenarios**:

1. **Given** a member has a confirmed payment of 200 Kč, **When** the admin reverses it, **Then** the member's owed balance increases by 200 Kč and the payment is marked reversed with the admin as actor.
2. **Given** a payment already reversed/voided, **When** the admin attempts to reverse it again, **Then** the system reports it is already reversed and changes nothing.
3. **Given** a member with no other activity whose only payment is reversed, **When** the reversal completes, **Then** their balance returns to exactly what it was before the payment was confirmed.

---

### User Story 3 - Void other balance-affecting records (Priority: P3)

Beyond drinks and payments, an admin can correct the occasional stray
match-bet or transfer that skews a balance, using the record's existing
void/reverse path. (Matches already expose cancel/reverse on `/match`; this
story only ensures the admin can reach those corrections, not a new mechanism.)

**Why this priority**: Lower — drinks + payments (US1/US2) cover the
overwhelming majority of "wrong number" cases, including the treasurer's
test data. Bet/match corrections already have surfaces; this is a
completeness sweep.

**Independent Test**: As admin, reverse a recorded match result or cancel an
agreement from `/match` and confirm the affected members' balances/IOUs
update consistently.

**Acceptance Scenarios**:

1. **Given** a recorded match that skewed balances, **When** the admin reverses it, **Then** the related charges/IOUs unwind and no half-settled state remains.

> **Out of scope** (descoped 2026-06-11 at user request): a club-wide
> "reset everything" / clean-slate action. The admin clears test data by
> voiding the specific records (US1 + US2), which is enough for the go-live
> cleanup and avoids a blunt, irreversible nuke.

---

### Edge Cases

- **Credit after voiding settled charges**: voiding consumptions a member already paid for leaves them in credit; the credit must be visible and carry forward (no surprise "you owe" later, no silent loss).
- **Match/bet entanglement**: voiding a consumption that came from a won/lost bet must not leave a half-settled bet (winner credited but loser not charged, or vice versa).
- **Concurrent actions**: two admins (or an admin and the member) acting on the same record at once must not double-apply (e.g. two voids, or a void racing a settle).
- **Authorization**: only a club admin may correct records; treasurers/stock managers/members may not (beyond their existing narrower powers).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A club admin MUST be able to void any consumption belonging to their club, regardless of its age or whether it has already been settled by a confirmed payment.
- **FR-002**: Voiding a consumption MUST adjust the member's balance and return the beer to stock, using the same audited mechanism as the existing void path (the entry is marked voided, never hard-deleted), and MUST record the acting admin and a timestamp.
- **FR-003**: A club admin MUST be able to reverse a confirmed payment belonging to their club, increasing the member's owed balance by the payment amount.
- **FR-004**: Reversing a payment MUST be recorded as an auditable state change (acting admin, timestamp, reason/marker) rather than deleting the payment.
- **FR-005**: All correction operations MUST preserve the balance-aggregation invariant: after any void or reversal, every per-member total stays consistent with the canonical balance (no member can be left in an impossible or unexplained state).
- **FR-006**: Correction controls (void consumption, reverse payment) MUST be reachable from the admin view that already shows a member's consumptions and payments, and MUST require a confirmation step before applying.
- **FR-007**: Voiding a bet-originated charge (or otherwise correcting a record tied to a match bet) MUST keep the paired bet legs consistent — no half-settled bets.
- **FR-008**: All correction capabilities MUST be restricted to club admins and scoped to the admin's own club; no cross-club data may be read or modified.
- **FR-009**: Corrections MUST be safe to run in production and reuse the existing audited compensating-row mechanisms (no new hard-delete paths).
- **FR-010**: Attempting a correction that is a no-op (already voided, already reversed) MUST report that state and change nothing (idempotent).
- **FR-011**: The admin member-detail MUST show the member's balance-affecting records across all sessions (not only the current open one), so old/settled records can be corrected.

### Key Entities *(include if feature involves data)*

- **Consumption**: a logged drink charged to a member; can be active or voided. Correction adds/uses a void record.
- **Consumption Void**: the audit record that a consumption was voided — who, when, why — and the source of stock restoration.
- **Payment**: money a member paid toward their balance, moving through claimed → confirmed (and now → reversed/voided). Reversal restores the owed amount.
- **Payment State Transition**: the audit trail of a payment's status changes, including an admin-initiated reversal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A club admin can remove any single wrong charge and the affected member's balance reflects it immediately (within one screen refresh), with the removal visible in the audit trail.
- **SC-002**: A club admin can reverse a confirmed payment and the member's owed amount returns to exactly its pre-confirmation value.
- **SC-003**: The treasurer's pre-launch test data (drinks + a confirmed payment) can be fully cleared record-by-record, returning the affected balances to where they should be for real use.
- **SC-004**: No correction can leave a member's balance in an inconsistent state — the per-member totals always equal the canonical balance (verifiable by reconciliation across all members).
- **SC-005**: Every correction is attributable to a specific admin with a timestamp (100% audit coverage; nothing is hard-deleted without a trace).
- **SC-006**: None of these capabilities are reachable by a non-admin, and none can touch another club's data.

## Assumptions

- **Credit handling**: voiding a consumption a member already paid for leaves the member in credit (negative owed balance), surfaced via the existing credit display and carried forward. No automatic monetary refund is issued by the system; any physical refund is handled out-of-band.
- **Payment reversal semantics**: reversing a confirmed payment moves it to a reversed/voided terminal state via the existing payment state-transition machinery (a new transition, not a delete). The system assumes the cash was a test or is refunded out-of-band; it only corrects the ledger.
- **Authorization**: only the `club_admin` role may use these corrections; treasurer and stock_manager may not, even though they have other elevated powers.
- **Surfacing**: corrections live in the existing admin balance/member-detail area that already lists a member's consumptions and pending payments (broadened to all-time records).
- **Reuse**: corrections reuse the existing audited void + payment-state-transition mechanisms rather than introducing new deletion paths, to keep the balance invariant intact and the audit trail complete.
- **"Delete" = audited void**: per the constitution's no-hard-deletes rule, removing a record marks it voided (it stops counting, is preserved in the trail), which gives the admin the outcome they want without losing auditability.
- **Out of scope**: a club-wide "reset everything" action (descoped 2026-06-11); editing a consumption's price/beer/member in place (correction is void-and-relog, not edit); bulk multi-record selection; cross-club or super-admin tooling.
