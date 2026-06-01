# Feature Specification: Inline "Log for Someone Else" on Home

**Feature Branch**: `029-inline-log-for-other` (spec dir only — shipped trunk-based on `main`)

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: do on-behalf logging from the landing page with the common dropdown selectors, no page reload — keep the landing page as the single surface for the most common actions.

## Clarifications

### Session 2026-06-01

- Q: Collapsed-tap-to-expand vs always-visible on home? → A: Collapsed by default; tapping the "log for someone else" affordance expands the control inline. Don't compete with the member's own one-tap self-log.
- Q: After a successful on-behalf log, what happens? → A: Keep both picker selections, stay expanded, refresh the home breakdown in place (no navigation).
- Q: Fate of the existing /log/for page? → A: Keep it as a deep-link fallback, unchanged.
- Q: Beer selector shape? → A: A new common BeerPickerDropdown (a dropdown matching the member dropdown), not a tile grid.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inline on-behalf log from home, no reload (Priority: P1)

Tereza is at the club buying a round. On home she taps "Log for someone else"; the control expands in place. She picks Pavel from the member dropdown, picks Pilsner from the beer dropdown, and taps Log. A 🍻 toast confirms "Logged Pilsner for Pavel", the home breakdown refreshes without the page reloading, and both pickers stay set. She changes only the member to Standa and taps Log again — a second beer logged, still on home, still no reload.

**Why this priority**: This is the feature — make the most-common social action (logging a round for the table) fast and reload-free on the single action surface, replacing a two-navigation, two-grid detour.

**Independent Test**: On home, the collapsed affordance expands to a member dropdown + beer dropdown + Log button; choosing both and tapping Log dispatches the on-behalf log, shows a success toast, refreshes the page data in place (no navigation), and leaves the selections intact for a follow-up log.

**Acceptance Scenarios**:

1. **Given** a member on home with other active members in the club, **When** they tap the "log for someone else" affordance, **Then** the control expands inline showing a member dropdown, a beer dropdown, and a Log button (the page does not navigate).
2. **Given** the expanded control with no member and/or no beer chosen, **When** the member looks at the Log button, **Then** it is disabled.
3. **Given** a chosen member and a chosen beer, **When** the member taps Log, **Then** the beer is logged for that member, a success toast naming the beer + member appears, and the home content refreshes in place without a full page navigation.
4. **Given** a just-completed on-behalf log, **When** the member looks at the control, **Then** it is still expanded with the member + beer still selected, so they can tap Log again or change one dropdown for the next person.
5. **Given** the member taps the collapse toggle, **When** the control collapses, **Then** home returns to the compact "log for someone else" affordance.

---

### User Story 2 - Nothing to do gracefully (Priority: P2)

A club with no other active members shows no on-behalf affordance on home — there's no one to log for. (A member-less or beer-less club is already handled by the existing home empty states.)

**Why this priority**: The control must not appear when it can't function, exactly as the current link already hides itself when there are no other members.

**Independent Test**: With no other active members, the on-behalf affordance is absent from home.

**Acceptance Scenarios**:

1. **Given** a club where the viewer is the only active member, **When** they open home, **Then** no "log for someone else" affordance is shown.

---

### User Story 3 - Errors surface inline without leaving home (Priority: P2)

The beer Tereza picked just went out of stock (someone took the last one). She taps Log; instead of a silent failure or a navigation, a clear error toast appears, no beer is logged, and she stays on home with her selections intact to pick a different beer.

**Why this priority**: On-behalf logging can fail (out of stock, target no longer eligible). Failures must be legible and non-destructive on the same screen.

**Independent Test**: When the log action returns a typed failure, the control shows an error toast, logs nothing, and preserves the member's selections.

**Acceptance Scenarios**:

1. **Given** a chosen beer that is now out of stock, **When** the member taps Log, **Then** an error toast appears, no beer is logged, and the selections remain.
2. **Given** any other typed failure from the log action, **When** it occurs, **Then** the member sees an appropriate error message and stays on home.

---

### Edge Cases

- **No other active members**: affordance absent (US2).
- **Out-of-stock beer**: the beer dropdown disables out-of-stock options; if a beer goes out of stock between load and tap, the action's typed error surfaces as a toast (US3).
- **Mid-log double-tap**: the Log button is disabled while a log is in flight, preventing accidental duplicate logs from one intent.
- **Expansion layout**: expanding the control must not push the member's own one-tap self-log button off-screen on a narrow phone, and must fit a 360-wide screen without horizontal scroll.
- **Concurrency**: each Log tap is one beer for one member; logging several is repeated taps (selections persist), not a batch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Home MUST provide an on-behalf log affordance that is collapsed by default and expands inline (without navigating away) into a member selector, a beer selector, and a Log action.
- **FR-002**: The member selector MUST be the common avatar dropdown used elsewhere for picking members; the beer selector MUST be a dropdown showing each in-stock beer's name and price, with out-of-stock beers non-selectable.
- **FR-003**: The Log action MUST be disabled until both a member and a beer are selected, and while a log is in progress.
- **FR-004**: Tapping Log MUST log the chosen beer on behalf of the chosen member using the existing on-behalf logging rules (self-target, club-membership, and stock validated server-side); it MUST NOT introduce a separate logging path.
- **FR-005**: A successful log MUST confirm with a toast naming the beer and member, and MUST refresh the home content (including the round breakdown) in place — no full page navigation.
- **FR-006**: After a successful log, the control MUST remain expanded with the member and beer selections preserved, enabling rapid repeat logging for a table.
- **FR-007**: A failed log MUST surface a clear, typed error message, log nothing, and preserve the member's current selections.
- **FR-008**: The on-behalf affordance MUST NOT render when the club has no other active members.
- **FR-009**: The control MUST be operable one-thumb on a 360-wide phone — large tap targets, no horizontal scroll, and expanding it MUST NOT displace the member's own one-tap self-log button off-screen.
- **FR-010**: The existing dedicated on-behalf page MUST remain available and unchanged as a deep-link fallback.
- **FR-011**: All new member-facing copy (expand/collapse affordance, beer selector placeholder, Log button, success + error messages) MUST be available in Czech and English, Czech-first, reusing existing on-behalf copy where it fits.

### Key Entities *(include if feature involves data)*

- **Member (existing)**: the on-behalf target — identified by id, shown by display name + avatar in the selector. Sourced from the club's other active members.
- **Beer type (existing)**: the beer being logged — id, name, price, stock. Sourced from the club's in-stock catalog the home page already loads.
- **On-behalf consumption (existing)**: the logged record (target member + actor + beer), created by the existing on-behalf log action. No new entity, no schema change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can log a beer for someone else without leaving the home page and without a full page reload.
- **SC-002**: Logging a second beer for a different person at the same table takes at most two taps after the first (change one dropdown + Log), because selections persist.
- **SC-003**: The home round breakdown reflects an on-behalf log immediately after it succeeds, on the same screen.
- **SC-004**: The control never appears when there is no one to log for, and never blocks or hides the member's own one-tap self-log.

## Assumptions

- **Q1 → collapsed, tap to expand**: keeps home uncluttered and the primary self-log dominant.
- **Q2 → keep selections + refresh in place**: optimised for logging a round; no navigation.
- **Q3 → /log/for kept unchanged** as a deep-link fallback (roomier tile-grid view).
- **Q4 → new common BeerPickerDropdown** (dropdown), mirroring the member dropdown; the home one-tap chevron and match bet-beer picker may adopt it later (dedupe follow-up, out of scope here).
- One beer per member per Log tap (no batch, no quantity) — the persistent selections already make a round fast.
- Reuses the existing on-behalf action + member-list query + home catalog; no schema change.
