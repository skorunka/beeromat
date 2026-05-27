# Feature Specification: Picker Avatars

**Feature Branch**: `024-picker-avatars`

**Created**: 2026-05-27

**Status**: Shipped (2026-05-27)

**Input**: User description: replace the three native `<select>`
member pickers (`/log/for`, `/match` new agreement form,
`/match/[id]` edit form) with avatar-bearing custom controls
so members are pick-able by face. Picks up the explicit
scope-cut spec 023 made when it deferred all picker work.

## Clarifications

### Session 2026-05-27

Three design questions resolved (all recommended defaults
confirmed by user) before planning:

- **Q1 — Picker shape per surface**: SHAPE-PER-CONTEXT.
  `/log/for` uses a MEMBER TILE GRID (matching the existing
  beer tile grid on the same screen). `/match` new + edit
  use an AVATAR DROPDOWN per seat (compact for 4 seats).
- **Q2 — Duplicate-seat protection on `/match`**: YES —
  candidates already assigned to another seat in the same
  agreement are disabled or omitted from the other seat
  pickers. Server-side validator stays as belt-and-braces.
- **Q3 — Filter-as-you-type on `/match` dropdown**: NO.
  Candidate lists scroll; keyboard nav covers fast access.
  Deferred to a future spec if a larger-club use case
  emerges.

## User Scenarios & Testing

### User Story 1 — Tap-to-pick member on /log/for (Priority: P1)

Tereza walks past Pavel's empty seat at the bar; Pavel asks
her to fetch him a Pilsner. She opens `/log/for`, sees a grid
of member tiles (each showing the member's face + name), taps
Pavel's photo, then taps "Pilsner" in the existing beer tile
grid below, then submits. Two taps, zero text-reading.

**Why this priority**: `/log/for` is a hot path during active
sessions (bar pickup, friend who stepped out for a minute).
The current native `<select>` requires reading every name in
a dropdown — visually slower than face recognition. This is
also the only spec-024 surface where the form mixes a
member-pick AND a beer-pick on the same screen; the beer
side is already a tile grid, so a member tile grid produces
visual harmony rather than two different selection idioms
side-by-side.

**Independent Test**: Seed a session with three other active
members (one with photo, one with glyph, one with neither).
Open `/log/for` as the seeded actor → confirm a tile grid
renders the three members with the right avatar variant
each → tap any tile → submit → confirm the on-behalf log
lands attributed to the chosen member.

**Acceptance Scenarios**:

1. **Given** the actor's club has three other active members
   with mixed avatar variants, **When** the actor opens
   `/log/for`, **Then** a member tile grid renders one tile
   per other-active-member with the correct avatar variant
   (photo / glyph / initials fallback).
2. **Given** the tile grid is rendered, **When** the actor
   taps a member tile, **Then** the tile becomes visually
   "selected" (matching the beer-tile selected style already
   used on the same screen) and the submit button's
   contextual label updates to reflect the chosen pair.
3. **Given** the actor has selected both a member and a
   beer, **When** they submit, **Then** the existing
   `logBeerOnBehalfAction` runs with the chosen
   `targetMemberId` — no change to the action contract.
4. **Given** the actor has no other active members in the
   club (single-member club), **When** they open `/log/for`,
   **Then** the existing "no opponents" empty state renders
   (no tile grid).

---

### User Story 2 — Recognize candidates on /match seat assignment (Priority: P1)

Pavel creates a Wednesday doubles agreement. He picks the
`doubles` format, then four "seat" controls appear (A1, A2,
B1, B2). Each is a compact dropdown trigger showing the
currently-picked member's avatar + name. He taps a seat,
the dropdown opens, every candidate shows their avatar +
name in the option list — Pavel reads faces and picks
without parsing names. Same affordance on the edit form.

**Why this priority**: `/match` seat assignment is the most
text-dense screen in the app today (4 dropdowns × ~30 names
each). Avatar dropdowns turn a name-reading exercise into a
face-recognition one — the same shift spec 023 made for
display rows.

**Independent Test**: Seed a club with ≥4 active members,
mixed avatars. Open the new-agreement form → pick doubles
format → open each seat dropdown → confirm avatars render
beside each candidate name → pick four members → submit.
Same flow on `/match/[id]` edit.

**Acceptance Scenarios**:

1. **Given** the doubles format is selected and the club has
   ≥4 active members, **When** Pavel opens any seat
   dropdown, **Then** each candidate option renders an
   avatar (inline size, fallback chain preserved) next to
   the display name.
2. **Given** Pavel has picked a member for seat A1, **When**
   the seat A1 trigger is in its idle state, **Then** the
   trigger shows the picked member's avatar + name (so the
   form's overall state is readable at a glance).
3. **Given** no member is yet picked for a seat, **When** the
   seat trigger is in its idle state, **Then** the trigger
   shows a neutral placeholder (no avatar, current localized
   placeholder copy preserved).
4. **Given** the agreement-edit form is open with already-
   assigned seats, **When** the page renders, **Then** each
   seat trigger already shows the picked member's avatar
   alongside their name.

---

### User Story 3 — Prevent duplicate seat assignment (Priority: P2)

Pavel accidentally taps his own face for both A1 and A2.
The A2 picker either greys him out (preferred) or omits
him entirely because A1 already claims him. The server-
side validator that catches this today stays as a
belt-and-braces guard, but the picker stops the user before
they reach submit.

**Why this priority**: Catches a real bug (today's native
`<select>` accepts duplicates and only the server-side
validator stops the submit). Lower priority than US1/US2
because the existing belt-and-braces guard means no data
corruption happens; this is a UX clarity win.

**Independent Test**: Open the doubles new-agreement form,
pick member X for A1, open the A2 picker → member X is
visually disabled or absent. Switch the format toggle to
singles and back to doubles → assignments reset cleanly
without stale "disabled" state.

**Acceptance Scenarios**:

1. **Given** seat A1 has member X picked, **When** the user
   opens the A2 picker, **Then** member X is either
   disabled (cannot be selected) or omitted from the option
   list.
2. **Given** seat A1 has member X picked, **When** the user
   clears A1 (picks "—" / unsets), **Then** member X
   becomes selectable again in the other seat pickers.
3. **Given** the form's format toggle flips between singles
   and doubles, **When** the seat count changes, **Then**
   any seat values that are now out-of-range are cleared
   and the "already-assigned" disable state recomputes
   correctly.

---

### Edge Cases

- **Standa-persona row in the picker**: A member who set
  neither a glyph nor a photo renders the existing initials
  chip inside the picker tile/option — same fallback chain
  as everywhere else (FR-007 from spec 023 stands).
- **Long display name** in a tile: truncate with ellipsis at
  the tile's width so the tile height stays uniform across
  the grid.
- **Long display name** in a dropdown option: option-row
  height stays uniform; name truncates after the avatar.
- **Single-other-member club** for `/log/for`: existing
  "no opponents" empty state covers this; tile grid does
  not render.
- **Single-other-member club** for `/match` doubles: form
  refuses (existing behavior); no special picker handling.
- **Picker re-renders mid-pick**: if another member is
  newly invited to the club while a seat dropdown is open,
  the option list MAY or MAY NOT reflect the new member
  (no real-time refresh requirement). Existing behavior
  preserved.
- **Keyboard navigation**: the dropdown surface (US2)
  supports arrow-up / arrow-down / Enter / Esc per the
  existing DropdownMenu primitive. The tile grid (US1)
  supports tab-through with Enter to select per native
  button semantics.

## Requirements

### Functional Requirements

- **FR-001**: System MUST replace the native member
  `<select>` on `/log/for` with a member tile grid (avatar
  + display name per tile, tap-to-select). The beer tile
  grid below remains unchanged.
- **FR-002**: System MUST replace each native seat
  `<select>` on the `/match` new-agreement form with an
  avatar-bearing custom dropdown (per Clarifications Q1).
  Each option row shows an avatar (inline size, fallback
  chain preserved) next to the display name.
- **FR-003**: System MUST apply the same dropdown to each
  seat control on the `/match/[id]` edit form.
- **FR-004**: Each dropdown trigger MUST render the
  currently-picked member's avatar + name in its idle state
  when a value is set; otherwise it renders a neutral
  placeholder using the existing localized placeholder copy.
- **FR-005**: Picker option rows + tile grid items MUST
  fall back to the existing initials chip when the member
  has neither a glyph nor an uploaded photo — no broken
  image, no layout shift (matches FR-007 of spec 023).
- **FR-006**: Seat dropdowns on `/match` MUST disable or
  omit members already assigned to another seat in the same
  agreement form (per Clarifications Q2 → α). Clearing the
  other seat re-enables the candidate.
- **FR-007**: Picker keyboard interaction MUST preserve
  the existing affordances: tile grid is tab-through with
  Enter-to-select; dropdown is arrow-up/down navigation
  with Enter to select and Esc to dismiss.
- **FR-008**: The existing server actions
  (`logBeerOnBehalfAction` and the match-agreement
  create/edit actions) MUST receive the same `memberId` /
  `targetMemberId` shape they receive today — picker
  changes are UI-only.
- **FR-009**: Member-list queries feeding the three
  surfaces MUST extend their result rows to include
  `avatarKey` and `avatarUploadAt` alongside the existing
  `id` + `displayName`.
- **FR-010**: Filter-as-you-type behavior is OUT OF
  SCOPE for this spec (per Clarifications Q3 → ⅰ). Long
  candidate lists scroll; keyboard nav covers fast access.
  Future expansion deferred.
- **FR-011**: Cross-club avatar URL requests MUST continue
  to return 404 (spec 021 behavior preserved) — no new
  endpoint surface.

### Key Entities

- **Member option**: A UI row in a picker. Carries the
  member's id, displayName, avatarKey, and avatarUploadAt
  (the inputs `MemberAvatar` needs). No new persistent
  entity.
- **Picker selection state**: A piece of form state
  identifying which member is currently picked for each
  control. Already exists in the relevant form controllers;
  this spec changes only the visual surface that reads /
  writes that state.
- **No new persistent entities**: All avatar inputs are
  already populated by specs 020 + 021. Member-list
  queries are extended to project the avatar fields, not
  to write anything new.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All three in-scope pickers render avatars on
  every option (tile or dropdown row) — verified by a
  manual walkthrough of `/log/for`, the `/match` new-
  agreement form (singles + doubles), and a `/match/[id]`
  edit on a seeded multi-avatar club.
- **SC-002**: Members with no avatar (no glyph, no upload)
  render the existing initials chip inside the picker
  surface — zero regression for persona P3 (Standa) and
  zero broken-image artifact on any tile / option.
- **SC-003**: Existing form submission contracts work
  unchanged after the swap — `logBeerOnBehalfAction` and
  the match-agreement actions accept the picked
  `memberId`(s) and persist as before.
- **SC-004**: A member already assigned to one seat is
  disabled or absent in every other seat picker in the
  same agreement form — verified by an interaction test
  on the new-agreement form (US3 acceptance scenarios).
- **SC-005**: Keyboard-only navigation completes a picker
  selection on all three surfaces — verified manually
  (tab + Enter on `/log/for` tiles; arrow + Enter on
  `/match` dropdowns).
- **SC-006**: Picker affordance loads with no perceptible
  delay vs. the current native `<select>` on a typical
  club's data (~30 members) — measured by manual feel
  (the avatar URLs are already cached from spec 023's
  other surfaces, so opening a dropdown for the first time
  reuses the cached images).

## Assumptions

- Members already have the option to pick a glyph (spec
  020) and upload a photo (spec 021); this spec adds zero
  member-side picker / upload work.
- The MemberAvatar component (`components/ui/member-avatar.
  tsx`) gained a `size` prop in spec 023; this spec reuses
  it (likely `size="row"` for tiles, `size="inline"` for
  dropdown option rows).
- The existing DropdownMenu primitive (base-ui via shadcn,
  already in use on the admin kebab + the user-menu
  language switcher) is the right surface for the `/match`
  seat dropdown — no new combobox dependency is needed.
- The two member-list queries that today feed `/log/for`
  and the `/match` forms already filter to the caller's
  club (constitution Principle II). Adding `avatarKey` and
  `avatarUploadAt` to their projected fields adds no new
  tenancy risk.
- Picker selection state lives in the existing form
  controllers (react-hook-form for `/match`; useState for
  `/log/for`). This spec changes the visual surface only;
  no controller refactor is needed.
- Performance: candidate lists are bounded by club size
  (~30 active members upper bound for the target use
  case). Scrolling is sufficient; filter-as-you-type is
  not warranted at this scale.
- Czech-first copy: no new strings expected. Existing
  placeholder copy ("—" or the localized "Vyber člena"
  equivalent) is reused on dropdown triggers in their
  unpicked state.
