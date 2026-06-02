# Feature Specification: Deferred match-bet settlement ("beer IOU" / dlužné pivo)

**Feature Branch**: `030-match-bet-iou` (authored on `main` — trunk-based)

**Created**: 2026-06-02

**Status**: Draft

**Input**: User description: Defer match-bet settlement. Recording a "for beer" match result should not move money or stock; it should create a visible debt ("X owes Y a beer"). The beer is picked when the match is created and can be overridden when the beer is actually handed over. Either party marks the beer delivered, which is the moment the cost lands on the loser's tab. The separate casual "take someone's drink" box is removed. Result wording changes from "Vyhrál/a" to "Vítěz:" (singles) / "Vítězové:" (doubles).

## Background / Problem

Today a "for beer" match settles the instant its result is recorded: the system silently books a beer onto the winner (as if drunk) and moves the cost to the loser. Members are confused — a winner has no visible "someone owes me a beer" to collect, the loser never acknowledges handing the beer over, and the system, not the people, chooses the beer and the timing. A second, overlapping "casual bet" surface ("Vyrovnat sázku / Prohraná sázka? Vezmi si na svou útratu pivo někoho jiného") lets anyone move another member's drink onto their own tab, compounding the confusion. This feature makes the bet match how people actually settle in the pub: you win → you can see who owes you → the beer is handed over → one tap records it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Winner sees who owes them a beer (Priority: P1)

After a "for beer" match is recorded, the winner can see, in plain language, that a specific person owes them a specific beer — and it stays visible until the beer is actually handed over. No money has moved yet.

**Why this priority**: This is the whole point of the redesign — the winner's "I'm owed a beer" must be visible and durable. Without it, the feature delivers nothing.

**Independent Test**: Record a for-beer singles match, log in as the winner, confirm home (and the match hub) shows "Dluží ti pivo — {loser}" with the planned beer, and that nothing has changed on anyone's tab/balance.

**Acceptance Scenarios**:

1. **Given** a for-beer singles match with a chosen beer, **When** the result is recorded with Side A winning, **Then** the A player sees "Dluží ti pivo — {B player}" and the B player sees "Dlužíš pivo — {A player}", and neither tab/balance changes.
2. **Given** a for-beer doubles match (pairing chosen), **When** the result is recorded, **Then** two independent IOUs exist (one per pair, per the pairing), each visible to its two members.
3. **Given** a friendly (not-for-beer) match, **When** the result is recorded, **Then** no IOU is created.

### User Story 2 - Either party marks the beer delivered (Priority: P1)

When the beer is physically handed over, either the loser or the winner taps "Předáno" (Delivered). They confirm the beer (pre-filled from match-create, overridable), and only then is the cost booked to the loser's tab and the IOU marked settled.

**Why this priority**: Settlement is the second half of the core loop; an IOU that can't be cleared is useless.

**Independent Test**: From a pending IOU, tap "Předáno" as either party, confirm/override the beer, and verify the loser's tab increased by exactly that beer's price, stock dropped by one, the winner's tab is unchanged, and the IOU is now settled and no longer appears as pending.

**Acceptance Scenarios**:

1. **Given** a pending IOU, **When** the loser taps "Předáno" and confirms the planned beer, **Then** the loser's tab/balance increases by that beer's price, stock decreases by one, and the IOU is settled.
2. **Given** a pending IOU, **When** the winner taps "Předáno" and overrides to a different in-stock beer, **Then** the overridden beer's price is charged to the loser and its stock decremented.
3. **Given** an IOU that was just settled, **When** anyone views the pending list, **Then** it no longer appears; the settled beer appears on the loser's tab and on the winner's tab as a won/struck-through (non-counting) row, exactly as bet transfers render today.
4. **Given** a pending IOU whose chosen beer is out of stock at delivery, **When** a party opens the deliver control, **Then** out-of-stock beers are not selectable and they must pick an in-stock beer.

### User Story 3 - Pick the beer when creating the match (Priority: P2)

When creating a "for beer" match, the creator picks which beer the match is played for. That beer becomes the IOU's default at delivery.

**Why this priority**: Sets the expectation up front and makes delivery one tap; but the flow still works with a sensible default if skipped, so it ranks below the core IOU loop.

**Independent Test**: Open the create form, toggle "🍺 Ano", confirm a beer picker appears, select a beer, and verify that the recorded match's IOUs carry that beer as the default shown at delivery.

**Acceptance Scenarios**:

1. **Given** the create form, **When** "🍺 Ano" (for beer) is selected, **Then** a beer picker is shown; **When** "Přátelák" is selected, **Then** no beer picker is shown.
2. **Given** the beer picker is open, **When** a beer is tapped, **Then** the dropdown closes immediately and shows the chosen beer (no stuck-open selector).
3. **Given** a for-beer match created with beer X, **When** its result is recorded, **Then** each IOU's default beer is X.

### User Story 4 - Clear result wording (Priority: P3)

The recorded result names the winner(s) as a noun, singular or plural by format: "Vítěz: {jméno}" for singles, "Vítězové: {jména}" for doubles — replacing "Vyhrál/a".

**Why this priority**: Pure clarity polish; independent of the IOU mechanics.

**Independent Test**: Record a singles result → heading reads "Vítěz: {name}"; record a doubles result → "Vítězové: {name + name}".

**Acceptance Scenarios**:

1. **Given** a recorded singles match, **When** viewing the result, **Then** the heading reads "Vítěz: {winner name}".
2. **Given** a recorded doubles match, **When** viewing the result, **Then** the heading reads "Vítězové: {both winner names}".

### User Story 5 - Casual "take a drink" box is gone (Priority: P2)

The standalone "Vyrovnat sázku / take someone's drink onto your tab" surface is removed; the match hub instead lists pending IOUs ("Sázky k vyrovnání") in both directions with the deliver action.

**Why this priority**: Removing the confusing duplicate is part of making the flow understandable; it is lower than the core loop only because it is a deletion + relocation rather than the new value.

**Independent Test**: Visit the match hub — the old "Pití, co si můžeš vzít / Beru si ho" section is absent; a "Sázky k vyrovnání" list shows the viewer's pending IOUs (owed and owing) with a deliver button each.

**Acceptance Scenarios**:

1. **Given** the match hub, **When** it loads, **Then** there is no "take someone's drink" section and the manual claim action no longer exists.
2. **Given** the viewer has pending IOUs in either direction, **When** the match hub loads, **Then** each appears in "Sázky k vyrovnání" with the correct direction wording and a "Předáno" action.

### Edge Cases

- **Reverse a still-pending match**: cancelling/reversing a match whose IOUs are all still pending must remove those IOUs and move no money or stock.
- **Reverse after delivery**: reversing a match whose IOU was already delivered follows the existing settled-transfer void path (the booked cost is reversed).
- **Double-delivery race**: two people tap "Předáno" on the same IOU near-simultaneously → the beer is booked exactly once; the second attempt is a no-op with a clear "already settled" outcome.
- **No open drink session at delivery**: delivering opens/uses the current session the same way logging a beer does.
- **Planned beer archived/out of stock at delivery**: the default is unselectable; the deliverer picks another in-stock beer.
- **Doubles with one pair settled, one pending**: each IOU settles independently; the still-pending pair remains visible.
- **Pending IOUs and totals**: a pending IOU must not appear in any tab, breakdown, or balance figure (no money until delivery).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Recording a "for beer" match result MUST create one pending beer-debt per losing↔winning pair (one for singles, two for doubles per the chosen pairing) and MUST NOT create any consumption, transfer, or stock change at that time.
- **FR-002**: Recording a "friendly" (not-for-beer) result MUST create no beer-debt and settle nothing.
- **FR-003**: Each beer-debt MUST record who owes (loser), who is owed (winner), the planned beer, the beer count (from the club's existing loser-beer-count setting), and a link back to its match.
- **FR-004**: Both the owing member and the owed member MUST be able to see each of their open beer-debts, with direction-correct wording ("Dlužíš pivo — {winner}" / "Dluží ti pivo — {loser}"), on the home screen and on the match hub.
- **FR-005**: A pending beer-debt MUST NOT contribute to any tab total, per-beer breakdown, or member balance.
- **FR-006**: Either the owing or the owed member (or a treasurer/admin) MUST be able to mark a beer-debt delivered.
- **FR-007**: When marking delivered, the actor MUST be able to confirm the planned beer or override it with any in-stock beer; out-of-stock beers MUST NOT be selectable.
- **FR-008**: Marking delivered MUST book the chosen beer's cost onto the owing member's tab and decrement stock, leaving the owed member's tab unchanged, using the same accounting as an ordinary won/lost-bet transfer so that tab, breakdown, and balance figures stay mutually consistent.
- **FR-009**: A beer-debt MUST be settled at most once; a second delivery attempt MUST NOT book a second beer and MUST surface an "already settled" outcome.
- **FR-010**: After settlement, the beer MUST appear on the owing member's tab as a charge and on the owed member's tab as a non-counting (struck-through) won-bet row, consistent with existing bet-transfer rendering.
- **FR-011**: When creating a "for beer" match, the creator MUST be able to pick the beer the match is for; the picker MUST close immediately on selection.
- **FR-012**: Selecting "Přátelák" (friendly) MUST hide the beer picker; the beer picker is only relevant when the match is for beer.
- **FR-013**: Reversing/cancelling a match whose beer-debts are still pending MUST delete/void those beer-debts and move no money or stock; reversing after delivery MUST reverse the booked cost via the existing void path.
- **FR-014**: The recorded-result heading MUST name the winner(s) as "Vítěz: {name}" for singles and "Vítězové: {names}" for doubles.
- **FR-015**: The standalone casual "take someone's drink onto your tab" surface and its action MUST be removed; the match hub MUST instead present the viewer's pending beer-debts (both directions) with a deliver action.
- **FR-016**: All new member-facing copy MUST be available in Czech and English (Czech-first); obsolete casual-bet copy MUST be removed from both catalogs.
- **FR-017**: All beer-debt reads and writes MUST be scoped to the caller's club, and the deliver action MUST re-validate the actor's eligibility, the target beer's availability, and stock on the server (never trusting client-supplied values).

### Key Entities *(include if feature involves data)*

- **Beer-debt (match bet IOU)**: a pending obligation that one member (loser) owes another (winner) a beer arising from a recorded for-beer match. Attributes: club, source match, owing member, owed member, planned beer, beer count, status (pending → settled or voided), audit fields, and — once settled — a link to the booked consumption/transfer that realized it. Replaces the at-record-time auto-settlement as the thing created when a for-beer result is recorded.
- **Bet transfer (existing)**: unchanged; now created at *delivery* time (from a beer-debt) rather than at result-record time. Continues to carry the actual money movement (winner-drunk cost → loser).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After recording a for-beer match, both winner and loser can locate the resulting IOU on the home screen within one screen, with no scrolling past the fold on a 390px phone.
- **SC-002**: Settling an IOU takes at most two taps from the home/match surface (open deliver → confirm) when the planned beer is in stock.
- **SC-003**: For 100% of recorded for-beer matches, no tab/balance figure changes until an IOU is explicitly delivered (pending IOUs are invisible to all money totals).
- **SC-004**: After delivery, the loser's balance increases by exactly the chosen beer's price and the winner's balance is unchanged, for 100% of settlements (verified by the existing balance invariant).
- **SC-005**: A for-beer match result can be reversed while pending with zero net change to any member's balance or to stock.
- **SC-006**: The app presents exactly one "bet" concept (match IOUs); the standalone casual "take a drink" surface no longer appears anywhere.

## Assumptions

- The existing club setting for how many beers the loser owes (default 1) drives the beer count; no new per-match count UI is added.
- Trust-based settlement is acceptable for this pet app: either party may mark delivered without the other's confirmation.
- The planned beer is a convenience default only; the beer actually charged is whatever is confirmed at delivery.
- Delivery uses/open the current drink session with the same semantics as logging a beer today.
- The singles/doubles mechanics and the "Přímé/Křížem" pairing concept are unchanged; only *when* money moves changes.
- The existing bet-transfer + void accounting is reused for the actual money movement, preserving the balance/tab/breakdown invariant.
- Authored on `main` (trunk-based); no feature branch.

## Out of Scope

- Changing singles/doubles rules or the pairing concept.
- A per-match beer-count chooser beyond the existing club setting.
- A dedicated "your bets" history/ledger view (backlog).
- Reminders/nudges for long-unsettled IOUs (backlog).
- Partial-beer deliveries (an IOU settles in full).
