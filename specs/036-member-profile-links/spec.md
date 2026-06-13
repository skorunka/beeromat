# Feature Specification: Member-name profile links everywhere

**Feature Branch**: `036-member-profile-links` (authored on `main`, trunk-based)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Make every member name across the match/tab/IOU/home surfaces a tap-through to that player's profile (/members/[memberId]). Spec 034 established 'tap a member → their profile' and shipped it on the match detail page, leaderboard rows, account, and profile cross-links — but several surfaces still render names as plain text dead-ends. Complete the loop, reusing the existing link pattern. No schema change. Don't nest anchors (the RecentResultsList row is itself a link)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tap a name on a beer-IOU to see who you're dealing with (Priority: P1)

A member looking at a beer-IOU ("Dlužíš pivo Honzovi" / "Franta ti dluží pivo") on
the home screen or the /match settle list taps the counterparty's name (or avatar)
and lands on that player's profile — to size up the rival they owe or are owed by.

**Why this priority**: IOUs are the surface where you most want to know "who is this
person?" and it already carries the counterparty's id + avatar, so it's the
highest-value, lowest-cost link. It's the anchor of the feature.

**Independent Test**: Open a profile/home with an IOU row, tap the counterparty
name/avatar, and confirm it navigates to that member's profile.

**Acceptance Scenarios**:

1. **Given** an IOU row showing a counterparty's avatar + name, **When** I tap either, **Then** I navigate to that counterparty's `/members/[id]` profile.
2. **Given** the IOU row also has deliver/write-off controls, **When** I tap a control instead of the name, **Then** the control still works (the name link doesn't swallow or block the buttons).

---

### User Story 2 - Tap the "logged by" name on your tab (Priority: P2)

A member reviewing their /tab sees a beer attributed "od {logger}" (someone logged it
on their behalf) or a "Runda" poured by someone; tapping the logger's name opens that
member's profile.

**Why this priority**: Natural curiosity ("who put this on my tab?") and it
completes the on-behalf/round provenance loop. Slightly lower than IOUs because the
row may need the logger's id surfaced.

**Independent Test**: On a tab with an on-behalf / round entry, tap the "od {name}"
logger name and confirm navigation to their profile.

**Acceptance Scenarios**:

1. **Given** a tab entry attributed to another member ("od Pepa"), **When** I tap that name, **Then** I navigate to Pepa's profile.
2. **Given** a self-logged entry (no "od X" attribution), **When** I view it, **Then** there is no dangling/extra link — only attributed names link.

---

### User Story 3 - Tap an opponent's name on the home match card (Priority: P3)

A member on the home screen sees the match-bet awareness module naming the
matchup/opponent; tapping a player's name opens their profile.

**Why this priority**: Nice-to-have completeness; the home match module is one more
text surface. Lower priority and only where it doesn't require nesting links.

**Independent Test**: With a home match module showing opponent names as text, tap a
name and confirm navigation to that member's profile (or confirm it's deferred with a
note if that surface nests anchors).

**Acceptance Scenarios**:

1. **Given** the home match module names a player as plain text, **When** I tap the name, **Then** I navigate to their profile.

---

### Edge Cases

- **No nested anchors**: any row that is itself a link to another destination (e.g. a results row linking to the match) MUST NOT gain an inner name-link — that nests anchors (invalid + unpredictable taps). Such rows are either restructured so the name sits outside the row-link, or explicitly deferred.
- **Missing member id**: if a surface shows a name but has no resolvable member id (e.g. a former/foreign member, or a shape that doesn't carry it and can't cheaply), the name stays plain text rather than linking nowhere — never a broken/empty link.
- **Own name**: tapping your own name links to your own profile (consistent with the leaderboard viewer-row behaviour).
- **Control vs. link**: where a name sits in a card alongside action buttons, tapping the name navigates and tapping a button acts — the two must not interfere.
- **Inactive member**: a deactivated member's profile still resolves (sticky data), so a link to them is fine.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On beer-IOU rows (home + /match settle list), the counterparty's avatar and name MUST link to that counterparty's profile.
- **FR-002**: On /tab entries attributed to another member ("od {logger}" on-behalf, and round/"Runda" provenance), the logger's name MUST link to that logger's profile.
- **FR-003**: On the home match-bet module, member names rendered as plain text MUST link to those members' profiles, UNLESS doing so would nest anchors inside an existing row-link (in which case that specific surface is deferred with a recorded note).
- **FR-004**: The system MUST NOT produce nested links (an `<a>` inside an `<a>`) on any surface; where a name sits inside an existing row-link, the row is restructured or the name-link is deferred.
- **FR-005**: A member name that has no resolvable profile target MUST remain plain text (no empty or broken link).
- **FR-006**: Name links MUST navigate to the same profile route used elsewhere (`/members/[memberId]`), and MUST be club-scoped (only members of the viewer's club are linked).
- **FR-007**: Existing controls adjacent to a newly-linked name (deliver, write-off, undo, etc.) MUST keep working unchanged — the link must not capture their taps.
- **FR-008**: Tap targets MUST be finger-sized and the link styling MUST match the existing member-name link look (consistent with leaderboard rows + the match detail player chips); no new visual language.
- **FR-009**: This feature MUST NOT change the database schema. Where a surface lacks the member id needed to build the link, the id (and any avatar fields, if an avatar is shown) MAY be added to that surface's existing data shape — additively, no schema change.
- **FR-010**: The feature MUST add no new profile content or behaviour — it only makes existing names reach the existing profile.

### Key Entities *(include if feature involves data)*

- **Member reference on a row**: the (memberId [+ displayName, avatar fields]) needed to render a name as a profile link. Some surfaces already carry it (e.g. IOU counterparty); others may need it added to their read shape (additive, no schema change).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every member name on the targeted surfaces (IOU rows, tab attribution, home match module) is either a working profile link or — where linking would nest anchors / lacks an id — explicitly and intentionally left plain (zero broken or empty links, zero nested anchors).
- **SC-002**: From an IOU row, a member reaches the counterparty's profile in one tap.
- **SC-003**: No existing action (deliver/write-off/undo, navigating a results row to its match) regresses — all still work after the change.
- **SC-004**: No schema migration is introduced.

## Assumptions

- **Reuses spec 034's profile route + link pattern** (`/members/[memberId]`, the i18n Link, the existing inline/row name-link styling). No new design.
- **IOU counterparty already carries its member id + avatar fields** (from spec 030's `BeerDebtRow`), so US1 needs no data-shape change.
- **The tab attribution row may need the logger's member id surfaced** on its read shape; this is an additive select, not a schema change. If it already carries it, no query change.
- **RecentResultsList is the known nested-anchor risk**: the plan decides restructure-vs-defer. Default lean is to DEFER it (keep the whole-row match link) rather than risk an invasive restructure, recording the deferral.
- **Self/own-name links are allowed** (matches leaderboard viewer-row).
- **Presentational change** — covered by component tests; no E2E. A light integration assertion only if a brand-new field is added to an existing query.
- **Single-club**, per the constitution — only same-club members are linkable.

## Out of Scope

- Any new profile content or profile restyling (only reaching the existing profile).
- RecentResultsList per-player links if the de-nesting restructure proves invasive (deferred to backlog with a note).
- Surfaces outside the match/tab/IOU/home areas (e.g. deep admin tables) unless a clearly-valuable plain-text name is found there during implementation.
