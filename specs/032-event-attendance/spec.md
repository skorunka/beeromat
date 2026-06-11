# Feature Specification: Event Attendance (RSVP)

**Feature Branch**: `032-event-attendance` (authored on `main` — trunk-based)

**Created**: 2026-06-11

**Status**: Draft

**Input**: Replace the club's separate sejdemse.net tool with an in-app
attendance feature: recurring weekly sessions (e.g. "Úterý 17:00 / Antuka"),
each member says going/not-going for this week's sessions, with a live
who's-coming list + headcount. Beers/matches stay independent; an evening's
beer session may optionally be tied to that day's event.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Say whether I'm coming this week (Priority: P1)

A member opens the app, sees **this week's** upcoming club sessions, and for
each one taps **Přijdu** (going) or **Nejdu** (not going). They see who else
is coming and the headcount, and can change their own answer until the
session starts.

**Why this priority**: This is the whole point — the daily member action and
the thing that replaces sejdemse. Without it nothing else matters.

**Independent Test**: With at least one open session existing, a member sets
going → appears in the who's-coming list and the count goes up; switches to
not-going → count goes down; the change sticks on reload.

**Acceptance Scenarios**:

1. **Given** an open session for this Tuesday, **When** a member taps Přijdu, **Then** they appear in the "who's coming" list and the going-count increases by one.
2. **Given** the member previously said Přijdu, **When** they tap Nejdu, **Then** they leave the going list and the count decreases.
3. **Given** it is Monday and the club has Tue/Thu/Sun sessions this week, **When** the member opens the app, **Then** all three are shown as open to RSVP.
4. **Given** it is Friday (Tue & Thu already passed), **When** the member opens the app, **Then** only Sunday is shown as open.
5. **Given** a session's start time has passed, **When** the member tries to change their answer, **Then** the session is shown as closed and no longer editable.

---

### User Story 2 - Set up a recurring weekly session (Priority: P1)

A club admin defines a recurring session as a template — a weekday, a start
time, and a place label (e.g. "Úterý / 17:00 / Antuka"). From then on the
system keeps the upcoming occurrences populated automatically, so members
always have the right sessions to RSVP to without anyone creating them by
hand each week.

**Why this priority**: There is nothing to RSVP to until a series exists;
it's the other half of the MVP. Done once, it runs itself.

**Independent Test**: Admin creates a Tuesday 17:00 series → the upcoming
Tuesday occurrence exists and is open for RSVP; the following week's Tuesday
appears automatically in due course without manual action.

**Acceptance Scenarios**:

1. **Given** no series exists, **When** the admin creates "Tuesday 17:00 Antuka", **Then** the upcoming Tuesday occurrence exists and members can RSVP to it.
2. **Given** an active series, **When** a week passes, **Then** the next week's occurrence is available automatically (no manual creation).
3. **Given** a non-admin member, **When** they look for series setup, **Then** it is not available to them.

---

### User Story 3 - Adjust or cancel a specific session (Priority: P2)

An admin can cancel a single occurrence ("no tennis this Tuesday — holiday")
or edit/deactivate a whole series, without disturbing other weeks.

**Why this priority**: Real schedules have exceptions; without this the admin
would be stuck. Lower than the core loop because the common case is "it just
runs".

**Independent Test**: Admin cancels this Tuesday's occurrence → members see
it as cancelled and cannot RSVP; next Tuesday is unaffected.

**Acceptance Scenarios**:

1. **Given** an upcoming occurrence, **When** the admin cancels it, **Then** members see it cancelled and cannot RSVP, while other occurrences of the series are unaffected.
2. **Given** an active series, **When** the admin deactivates it, **Then** no new occurrences are generated, while past records remain.

---

### User Story 4 - Admin fixes someone else's RSVP (Priority: P2)

Only an admin can set or change another member's status — for "Pepa texted
me he's coming" or to correct a mistake. Regular members can never edit
anyone but themselves (the explicit fix for sejdemse, where anyone could
change any row and people got toggled by accident).

**Why this priority**: A safety/correctness property more than a daily need;
the common path is self-RSVP only.

**Acceptance Scenarios**:

1. **Given** an open session, **When** an admin sets another member to Přijdu, **Then** that member appears as going, attributed as set by the admin.
2. **Given** an open session, **When** a regular member views it, **Then** they can change only their own status; no control exists to change anyone else's.

---

### User Story 5 - See the beers tied to an event evening (Priority: P3)

When the beers-after happen on an event night, that evening's beer session can
be associated with the event occurrence, so the occurrence shows a link to
"beers from this night". This is **optional and additive** — beer and matches
work exactly as today, with or without an event.

**Why this priority**: A nice unification of the evening, but the core RSVP
value stands alone. Lowest priority; the seam matters more than rich views.

**Acceptance Scenarios**:

1. **Given** an event occurrence whose evening has an associated beer session, **When** anyone views the occurrence, **Then** it links to that session's tab.
2. **Given** a beer session on a non-event day (a pair just showed up to play their bet match and drink), **When** it is created and used, **Then** it has no event association and behaves exactly as today.
3. **Given** a member who did not RSVP or did not play, **When** they log a beer on an event evening, **Then** it is logged normally to that evening's session (beer is never gated on attendance).

### Edge Cases

- **Week boundary**: "this week" is Monday–Sunday (Czech convention). On the week's turn, next week's occurrences open and the prior week's close.
- **Closing time**: an occurrence stops accepting RSVPs at its **start time** on its day (Tuesday 17:00 closes at 17:00 Tuesday), not midnight.
- **Cancelled occurrence**: shown as cancelled, not RSVP-able; does not count toward "open this week".
- **No series / nothing this week**: the member view shows a friendly empty state, not an error.
- **Cron idempotency**: the nightly maintenance run must be safe to run repeatedly / late / twice — it never duplicates occurrences or loses RSVPs.
- **RSVP race**: two rapid taps (or member + admin at once) settle to one status per member per occurrence, no duplicates.
- **Series edited after occurrences exist**: changing a series' time/place affects future occurrences; already-open or past ones are not silently rewritten.
- **Low turnout**: the playful nag line appears when few are going (beeromat tone), like sejdemse's "Je to bída :(".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A club admin MUST be able to create a recurring weekly session series defined by weekday, start time, and place label, scoped to their club.
- **FR-002**: The system MUST automatically maintain upcoming occurrences for each active series on a recurring (nightly) basis, without manual per-week creation, and the maintenance MUST be idempotent (safe to re-run, never duplicating occurrences).
- **FR-003**: For each series, the occurrences of the **current week that have not yet started** MUST be open for RSVP; occurrences in future weeks MUST exist but remain locked until their week becomes current.
- **FR-004**: An occurrence MUST stop accepting RSVP changes at its start time.
- **FR-005**: A member MUST be able to set their own RSVP to going or not-going, defaulting to "no answer", and change it any number of times while the occurrence is open.
- **FR-006**: A member MUST be able to set/change ONLY their own RSVP. Only a club admin MAY set/change another member's RSVP.
- **FR-007**: Each occurrence view MUST show the roster's statuses ("who's coming") and a headcount of members who are **going** ("no answer" and "not going" do not count toward the headcount).
- **FR-008**: When the going-count is low, the system MUST show a playful low-turnout message in the club's tone.
- **FR-009**: A club admin MUST be able to cancel an individual occurrence and to edit/deactivate a series; cancelling/deactivating MUST NOT affect unrelated occurrences and MUST preserve past records.
- **FR-010**: All series, occurrences, and RSVPs MUST be club-scoped; no cross-club read or write.
- **FR-011**: An occurrence MAY be optionally associated with that evening's beer (drink) session; the association MUST be additive and optional — logging beer, playing matches, and opening sessions MUST work unchanged whether or not an event exists.
- **FR-012**: Logging a beer MUST NOT be gated on RSVP or attendance; any club member may log beer to an evening's session regardless of their event status.
- **FR-013**: Past occurrences MUST remain viewable as a record of who said they would come (read-only once closed).

### Key Entities *(include if feature involves data)*

- **Event Series**: a club's recurring weekly session template — weekday, start time, place label, active flag. Owned/managed by admins.
- **Event Occurrence**: one concrete dated instance of a series (e.g. Tue 16 June 17:00), with a status (scheduled / cancelled) and an open/closed RSVP state derived from the current week + start time. Optionally linked to a drink session. Auto-generated and auto-maintained.
- **RSVP**: one member's status (going / not-going) for one occurrence; absence of a record = "no answer". At most one per member per occurrence. Records who set it (self vs admin-on-behalf).
- **Drink Session** (existing): the evening's beer ledger; gains an OPTIONAL link to an occurrence. Unchanged otherwise.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can see this week's sessions and set going/not-going for one in under 15 seconds, one-handed, with no setup.
- **SC-002**: After an admin creates a series once, members can RSVP to its upcoming occurrences every week with zero further admin action.
- **SC-003**: At any moment, exactly the current-week, not-yet-started occurrences are open for RSVP — verifiable by date (Monday shows the whole week; later days show only what remains).
- **SC-004**: No member can change another member's RSVP; only admins can — verifiable by role.
- **SC-005**: The club can fully replace sejdemse for the weekly "who's coming" need (recurring sessions, going/not-going, headcount) without a second login.
- **SC-006**: Beer and match flows behave identically with or without an event present (no regression); the event link is purely additive.

## Assumptions

- **Timezone**: session times and the week boundary are interpreted in the club's local time (Europe/Prague for the current club). The nightly maintenance job accounts for this when deciding what is "this week" and what has "started".
- **Week start**: Monday (Czech/ISO convention).
- **Generation horizon**: occurrences are maintained a small rolling number of weeks ahead (e.g. ~4–6) so admins can pre-cancel a specific future date; only the current week's are ever open.
- **Members-only**: RSVP and beer logging are for club members (who have accounts). True non-member guests are out of scope for v1; a "guest who comes for beer but didn't play" is assumed to be a club member who simply logs beer without RSVPing.
- **One status per member per occurrence**: switching overwrites; no history of prior answers is kept (only who currently holds the status and who set it).
- **Closing semantics**: an occurrence closes for RSVP at its start time; it remains viewable read-only afterward.
- **Reuse**: members, roles (admin gating via the existing role hierarchy), avatars, and the existing drink-session model are reused; the event feature adds the series/occurrence/RSVP entities + one optional FK on drink sessions.

## Out of Scope (v1)

- "Maybe" status (binary going/not-going only).
- Capacity / courts / waitlist (headcount only).
- Per-occurrence notes/comments/chat thread (the sejdemse "Informace o srazu" panel) — deferred to a follow-up.
- Push notifications / reminders (no service worker push in v1 per the constitution).
- A full recurrence engine (RRULE, holidays, arbitrary patterns) — weekly template + generated occurrences only.
- Non-admin on-behalf RSVP.
- Rich "beers per event" stats/leaderboards (only the optional link + a pass-through to the tab in v1).
- External non-member guests.
