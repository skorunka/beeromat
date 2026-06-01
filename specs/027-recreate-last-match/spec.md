# Feature Specification: Recreate Last Match

**Feature Branch**: `027-recreate-last-match` (spec dir only — shipped trunk-based on `main`)

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: one-tap "recreate last match" on the /match hub so clubs that play the same matchup repeatedly skip re-entering the whole New-match form.

## Clarifications

### Session 2026-06-01

- Q: Whose "last match" anchors the clone? → A: The current MEMBER's last match — the most recent agreement the acting member was a participant in (not the club-wide last match). Each member's recreate reflects the matchup they themselves last played.
- Q: One-tap direct-create, or pre-fill the form for editing? → A: Direct create on tap — create the agreement immediately and navigate to its detail page; tweaks happen via the existing edit/cancel flow afterward.
- Q: A prior participant is no longer an ACTIVE club member — what happens? → A: Block recreate with a clear member-facing error; create no agreement.
- Q: Does a CANCELLED agreement anchor the clone? → A: Yes — any agreement state (open/recorded/cancelled) is a valid recreate source; only the lineup is cloned.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-tap recreate of the last matchup (Priority: P1)

Mara plays the same doubles game most weeks: Franta + Pepa vs Honza + Standa, for beer, straight pairing. Today she opens the Match hub and, at the top, sees a "Recreate" affordance already labelled with that exact matchup. She taps it once and lands on a fresh open match agreement with the identical lineup, for-beer flag, and pairing — without touching the New-match form.

**Why this priority**: This is the entire point of the feature — eliminate repeated identical data entry for the common "same as last time" case. It mirrors the home one-tap log (spec 017) which made "log my usual beer" a single action.

**Independent Test**: With at least one prior match agreement the member participated in, the Match hub renders a recreate control labelled with that prior matchup; activating it creates a new OPEN agreement whose lineup/format/for-beer/pairing equal the member's most recent prior agreement, and navigates to that new agreement's detail page.

**Acceptance Scenarios**:

1. **Given** the member's most recent match agreement is "Franta + Pepa vs Honza + Standa, doubles, for-beer, straight", **When** the member opens the Match hub, **Then** a recreate control is shown labelled with that matchup.
2. **Given** that recreate control, **When** the member activates it, **Then** a new OPEN match agreement is created with the same format, the same four player seats, the same for-beer flag, and the same pairing, and the member is taken to the new agreement's detail page.
3. **Given** the most recent prior agreement was a SINGLES match, **When** the member recreates it, **Then** the new agreement is singles with the same two players and no pairing.
4. **Given** the most recent prior agreement was CANCELLED, **When** the member recreates it, **Then** the new agreement clones that cancelled match's lineup (the prior result/state is irrelevant — only the lineup is the template).

---

### User Story 2 - No prior match to recreate (Priority: P2)

A brand-new club, or one that has simply never run a match, opens the Match hub. There is nothing to recreate, so no recreate control appears — only the normal Upcoming list and New-match form.

**Why this priority**: Empty-state correctness. Showing a recreate button with nothing to clone (or a broken label) would confuse and erode trust in the affordance.

**Independent Test**: With zero prior match agreements the member participated in, the Match hub renders no recreate control.

**Acceptance Scenarios**:

1. **Given** a member who has never participated in a match agreement, **When** they open the Match hub, **Then** no recreate control is rendered (even if other members of the club have played matches).

---

### User Story 3 - Stale lineup guard (Priority: P2)

A club removed or blocked a former member who was a participant in the last match. A member taps recreate. Instead of a server error or a broken half-built match, they see a clear message explaining that the last match can't be recreated because that person is no longer in the club.

**Why this priority**: Without this guard the feature would either 500 or silently produce an invalid agreement when a roster changes — a realistic occurrence for any club over time.

**Independent Test**: When a participant of the most recent agreement is no longer an active club member, activating recreate produces a clear, member-facing error and creates no new agreement.

**Acceptance Scenarios**:

1. **Given** the most recent agreement included a member who has since been deactivated/removed, **When** a member activates recreate, **Then** no new agreement is created and the member sees a clear "can't recreate — someone from that match is no longer in the club" message.

---

### Edge Cases

- **No prior match**: recreate control is absent (US2).
- **Inactive/removed participant**: recreate is blocked with a clear message; no agreement created (US3).
- **Concurrent recreate (two taps / two members)**: each activation creates its own independent new agreement — recreate is not idempotent and is not expected to be; duplicate open agreements with the same lineup are harmless and individually cancellable.
- **The most recent agreement is itself an un-acted-on OPEN agreement**: recreate still clones it (producing a second open agreement with the same lineup); acceptable — the user asked to recreate the last setup.
- **Per-club isolation**: recreate only ever reflects and clones the member's own most recent agreement within their club; another club's matches are never visible or cloneable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Match hub MUST display a recreate control when, and only when, the acting member has participated in at least one prior match agreement.
- **FR-002**: The recreate control MUST be labelled with the matchup it will clone, showing both sides' player names (e.g. "Franta + Pepa vs Honza + Standa"), so the member knows what they are recreating before activating it.
- **FR-003**: "Last match" MUST be resolved as the acting member's most-recently-created match agreement they were a participant in, regardless of that agreement's state (open, recorded, or cancelled).
- **FR-004**: Activating recreate MUST create a new OPEN match agreement whose format, both sides' player seats, for-beer flag, and pairing kind equal those of the resolved last match.
- **FR-005**: On successful recreate, the member MUST be taken to the newly created agreement's detail page (the same destination as creating a match through the New-match form).
- **FR-006**: Recreate MUST reuse the existing match-creation rules (members-belong-to-club and no-duplicate-member validation); it MUST NOT introduce a parallel creation path that could diverge from those guards.
- **FR-007**: If any participant of the last match is no longer an active member of the club, recreate MUST NOT create an agreement and MUST surface a clear member-facing error.
- **FR-008**: Recreate MUST be scoped to the acting member's club — it MUST never read or clone another club's match.
- **FR-009**: Recreate MUST require the same authenticated, unlocked session as creating a new match through the form.
- **FR-010**: All new member-facing copy (the recreate label, the matchup template, and the stale-participant error) MUST be available in both Czech and English, with Czech as the primary language.

### Key Entities *(include if feature involves data)*

- **Match agreement (existing)**: the scheduled match record — carries format (singles/doubles), for-beer flag, pairing kind, creation time, and state (open/recorded/cancelled). The "last match" is the one with the latest creation time in the club. No new fields; no schema change.
- **Match agreement side (existing)**: the per-seat participant assignment (side A/B, seat 1/2, member). The set of these for the last match is the lineup that recreate clones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a club with a prior identical matchup, setting up the same match again takes a single action (one tap) instead of completing the multi-field New-match form.
- **SC-002**: The recreate control's label correctly names the member's most recent matchup 100% of the time (the displayed lineup matches the agreement that will be cloned).
- **SC-003**: Recreating any valid prior match produces a new agreement whose lineup, format, for-beer flag, and pairing are identical to the source — verified for both singles and doubles, and for cancelled-source matches.
- **SC-004**: A roster change that invalidates the last match's lineup never results in a server error or a malformed agreement — the member always gets a clear, actionable message.

## Assumptions

- **Q1 → "my last match"** (clarified 2026-06-01): "Last match" is the acting member's most recent agreement they participated in, not the club-wide last match. Each member's recreate reflects the matchup they themselves last played; a member who has never played sees no recreate control even if the club has run matches.
- **Q2 → direct create, no pre-fill**: Activating recreate creates the agreement immediately and navigates to it (no intermediate review/edit step). The "same as last time" case is the whole point; a member who needs a tweak uses the existing edit/cancel flow on the new agreement's detail page.
- **Q3 → block on inactive participant**: An inactive/removed participant blocks recreate with a clear error rather than being silently dropped. The existing creation guard validates club membership; this spec additionally treats a no-longer-active participant as a blocking condition.
- **Q4 → cancelled matches still anchor**: A cancelled agreement is a valid recreate source — recreate clones the lineup only; the prior outcome is irrelevant.
- The recreate control lives only on the Match hub for this spec; no home-screen entry.
- No matchmaking intelligence (no "rotate the loser out") — pure clone of the prior lineup.
- Reuses the existing match-agreement data model unchanged; no migration.
