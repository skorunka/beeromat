# Feature Specification: Custom Drink-Session Titles

**Feature Branch**: `022-session-titles`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: let a member give the current (or a
past) drink-session a custom title so /history reads as
"Středeční debly s Pardubicema" instead of an endless list of
"Round / Kolo" fallbacks.

## Clarifications

### Session 2026-05-27

- Q: Who can set/edit a session title? → A: Option A — any
  active member of the club. Matches the small-group trust
  model already used by log-on-behalf (spec 019); restricting
  to admins would feel corporate.
- Q: When can a title be set? → A: Option β — any session,
  current or past. Retroactive naming (US2) stays in scope —
  the treasurer reconciling old "Round / Kolo" entries can
  name them weeks later. Same UPDATE statement, same permission
  check.
- Q: Where does the "set title" affordance live? → A: Option
  III — both. Inline edit on /tab for the live session AND on
  /history/[sessionId] for any session. Same inline-edit
  component reused at both mount points; single source of
  truth for the edit UX.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Name the current session (Priority: P1)

Tereza opens `/tab` during Wednesday doubles, taps the session
subtitle below the page title, types "Středeční debly s
Pardubicema", and saves. The title updates inline immediately
and shows on `/history` for the still-open session.

**Why this priority**: This is the primary use case — name the
session you're in. Without US1, the feature delivers nothing
useful. US2 + US3 layer on top.

**Independent Test**: A member with an open session navigates
to /tab, taps the inline title affordance, types a string, and
sees the title update on /tab + /history (still-open row) on
the next render tick.

**Acceptance Scenarios**:

1. **Given** a member viewing /tab during an open session with
   no title set, **When** they tap the inline title affordance
   and type a name, **Then** the field accepts the input + a
   save action commits it; both /tab subtitle and the /history
   list row update on the next render.
2. **Given** a session that already has a title, **When** a
   member taps the affordance, **Then** the input is pre-filled
   with the existing title (editable, not append).
3. **Given** a member edits a title and submits an empty value,
   **Then** the title is cleared back to NULL and the renderer
   shows the "Round / Kolo" fallback again.

---

### User Story 2 - Retroactively title a past session (Priority: P2)

Jiří is reconciling last month's balances. He opens
`/history/[sessionId]` for the unlabelled session from
2026-04-12, taps the H1, types "Po finále s Plzní", and saves.
The /history list updates immediately.

**Why this priority**: P2 because the live-session path (US1)
delivers most of the value. Retroactive renaming is a treasurer
convenience that matters when reconciling old data; not on the
hot path for daily members.

**Independent Test**: With at least one closed session in the
DB, a member opens `/history/[sessionId]`, edits the title via
the inline affordance, saves, then navigates back to /history
and sees the new title on the corresponding row.

**Acceptance Scenarios**:

1. **Given** a past (closed) session, **When** an authorized
   member opens its detail page and edits the title, **Then**
   the new title saves and the /history list reflects the
   change on the next render.
2. **Given** a past session with a title, **When** a member
   edits and clears it, **Then** the fallback "Round / Kolo"
   returns on every surface.

---

### User Story 3 - Untitled sessions stay friendly (Priority: P2)

A member who never bothers to title a session — Standa, every
session — sees the generic "Round / Kolo" string everywhere the
session is rendered (/history list, /history detail, /tab
subtitle). The empty state must look intentional, not broken.

**Why this priority**: P2 because this is a regression-prevention
story rather than a new capability. Crucial for the canary
persona (Standa) — if his sessions suddenly read as empty
strings or "(no title)", the feature is broken for him.

**Independent Test**: With a session whose title is NULL, every
surface that renders the session title shows the localized
"Round / Kolo" string and renders without layout shift vs. a
session that has a title.

**Acceptance Scenarios**:

1. **Given** a session with `title = NULL`, **When** it appears
   on /history list, **Then** the row shows "Kolo" (cs) / "Round"
   (en).
2. **Given** the same session opened in detail view, **When**
   the page renders, **Then** the H1 shows "Kolo" / "Round" and
   the edit affordance is reachable for naming it.

---

### User Story 4 - Long-title guardrails (Priority: P3)

A member types a wall of text into the title input. The field
caps the length and the renderer never overflows row cards on
/history.

**Why this priority**: P3 because it's a guardrail, not a feature
members ask for. Without it, an enthusiast could break the
list layout. Easy to satisfy with one validation rule.

**Independent Test**: Pasting a 1000-character string into the
title input cuts off at the max length; the saved title fits
in a /history list row without layout shift.

**Acceptance Scenarios**:

1. **Given** the title input, **When** the user types past the
   max-length cap, **Then** further characters are rejected
   (the input does not exceed the cap).
2. **Given** a title at the maximum allowed length, **When**
   /history renders it, **Then** the row truncates with an
   ellipsis if needed; no horizontal scroll on a 360×640 phone.

---

### Edge Cases

- **Concurrent edits**: two members edit the title on different
  devices at the same time. Last write wins (no merge); both
  devices reflect the final state on next render. Same model
  as the spec-020 avatar pick.
- **Member with no open session edits via /tab**: /tab today
  shows a "no open session" empty state — the title affordance
  MUST hide there. There's no session to name.
- **Title submitted whitespace-only**: treated as empty →
  cleared to NULL.
- **Permission denied** (member tries to edit a title they're
  not authorized to set): the affordance MUST not be shown.
  Cross-club edits are impossible via the UI; defense at the
  action layer catches direct API calls.
- **Czech diacritics + emoji**: the input must accept full
  Unicode (typical Czech use will include diacritics; some
  members may add emoji like 🎾 for fun).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A member MUST be able to set or edit the title of
  the currently-open drink session from `/tab`.

- **FR-002**: A member MUST be able to set or edit the title of
  any drink session (current or past) from
  `/history/[sessionId]`.

- **FR-003**: The set-title action MUST persist to the session
  row immediately and MUST be reflected on the next render of
  every surface that displays the session title (`/tab`,
  `/history` list, `/history/[sessionId]` detail).

- **FR-004**: Submitting an empty title (including a value that
  is only whitespace) MUST clear the title back to the unset
  state. The renderer's "Round / Kolo" localized fallback then
  applies.

- **FR-005**: Title length MUST be capped at a sensible maximum
  (planning decision: 60 characters; see Assumptions). Input
  beyond the cap MUST be rejected client-side; server-side
  validation MUST also reject (defense in depth).

- **FR-006**: A session whose title is unset MUST render as the
  localized "Round / Kolo" string on every surface — preserving
  today's behavior for members who never set titles.

- **FR-007**: Any active member of the club MAY set or edit a
  session title (per Clarifications 2026-05-27 — Option A).
  The rule MUST be enforced at the server-action boundary
  (`requireUnlocked()` + active-member check), not only in
  the UI.

- **FR-008**: Title text MUST accept full Unicode — Czech
  diacritics, emoji, etc.

### Key Entities *(include if feature involves data)*

- **Drink session title**: reuses the existing
  `drink_sessions.title` column (today always NULL for
  auto-opened sessions). String value capped at the FR-005
  length, trimmed of surrounding whitespace, or NULL when
  unset. No new table or columns — purely activating an
  existing field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can name the current session in 3 taps
  or fewer from `/tab` (tap subtitle → type → save).

- **SC-002**: A saved title appears on every surface (/tab,
  /history, /history/[id]) on the next render tick — no stale
  fallbacks remain.

- **SC-003**: Members who never set a title experience zero
  regressions: the "Round / Kolo" fallback renders exactly as
  before this spec shipped (SC for the spec-001 / spec-009
  fallback contract).

- **SC-004**: A title at the maximum allowed length renders in
  a /history row on a 360×640 phone without breaking layout
  (truncates with ellipsis if needed; no horizontal scroll).

- **SC-005**: Title editing is a single live save — no separate
  "Are you sure?" confirmation step (matches Principle V).

## Assumptions

- The maximum title length is **60 characters**. Long enough
  for "Středeční debly s Pardubicema 6-2" (≈ 32 chars) and
  similar phrases; short enough to fit a row card on a phone
  without truncation in most cases.

- The renderer fallback string remains today's "Kolo" /
  "Round" (`history.drinkSession` catalog key). No copy
  change.

- A session's title is a small piece of low-stakes social
  metadata. The spec does NOT introduce an audit trail of
  who-renamed-when (matches the spec-020 avatar-pick
  precedent: low-stakes personal/social metadata, no event
  log).

- The inline affordance UX (click-to-edit, blur-to-save vs.
  explicit Save button) is a planning-time decision. Either
  approach satisfies FR-003 + SC-001 + SC-005.

- The permission rule (FR-007) is a planning-time decision —
  see the deliberately-deferred design questions in the
  brief.

- The existing `getSessionHistory` + `getSessionDetail`
  queries already SELECT `title`. No query changes are
  mandatory.

## Dependencies

- Reuses the existing `drink_sessions.title` column. No
  schema migration needed.

- Reuses the existing `history.drinkSession` i18n key for the
  unset-state fallback.
