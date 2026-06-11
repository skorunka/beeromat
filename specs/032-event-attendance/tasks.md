# Tasks: Event Attendance (RSVP)

**Feature**: `specs/032-event-attendance/` | **Branch**: `main` (trunk-based)

Per-series weekly recurring sessions; current-week occurrences open for RSVP;
nightly idempotent cron generation; members RSVP only themselves, admin-only
on-behalf; optional additive occurrence↔drink-session link. MVP = US1 + US2.

**Test layers** (plan.md / pyramid): unit-heavy for the pure date/turnout
logic (incl. a DST case); lean integration (RSVP upsert authz + idempotent
generation); component for the controls. E2E N/A.

---

## Phase 1: Setup

- [ ] T001 Add the `events.*` i18n namespace skeleton (cs + en) in `messages/cs.json` / `messages/en.json` — section header keys, going/not-going labels, who's-coming heading, low-turnout lines, admin series-form labels (filled as stories land; create the namespace now so later tasks add under it).

---

## Phase 2: Foundational (blocking — schema, pure logic, queries)

- [ ] T002 Schema `lib/db/schema/events.ts`: `event_series`, `event_occurrences` (UNIQUE (series_id, occurrence_date); status enum scheduled|cancelled), `event_rsvps` (UNIQUE (occurrence_id, member_id); status enum going|not_going; setByUserId), all club-scoped; add nullable `occurrenceId` FK on `drink_sessions` (onDelete set null). Export types.
- [ ] T003 Generate the Drizzle migration for T002 (`pnpm db:generate`) and apply to dev (`pnpm db:migrate`); verify the unique indexes exist.
- [ ] T004 [P] PURE `lib/events/prague-time.ts`: `pragueLocalToInstant(date, 'HH:MM'): Date` (DST-aware via Intl offset), no new dependency.
- [ ] T005 [P] PURE `lib/events/window.ts`: `currentPragueWeek(now)`, `isOccurrenceOpen({status,occurrenceDate,startsAt}, now)`, `nextOccurrenceDates(weekday, fromDate, horizonWeeks)`, `lowTurnoutMessageKey(goingCount)`.
- [ ] T006 [P] Unit tests `tests/unit/events-window.spec.ts`: week boundary (Mon/Sun), open/closed at start-time, generation dates for a weekday, low-turnout threshold, **and a DST-transition case** (a 17:00 Prague session in late-March and late-October maps to the correct UTC instant).
- [ ] T007 [P] Validation `lib/validation/events.ts`: `createSeriesSchema`, `updateSeriesSchema`, `setRsvpSchema`, `setMemberRsvpSchema`; unit test the schemas in `tests/unit/events-validation.spec.ts`.
- [ ] T008 Queries `lib/db/queries/events.ts`: `ensureOccurrences(clubId?)` (idempotent insert via onConflictDoNothing using T004/T005), `listOpenThisWeek(clubId, now)` (open occurrences + going-count + caller status), `getOccurrenceDetail(occurrenceId, clubId)` (roster + statuses + count + linked sessionId), `listSeries(clubId)`.

**Checkpoint**: schema migrated; pure logic unit-green; queries available.

---

## Phase 3: User Story 1 — Say whether I'm coming this week (P1)

**Goal**: member sees this week's open sessions and sets own going/not-going.

**Independent test**: with a series + occurrence present, set going → in list + count up; not-going → out + count down; persists on reload; closed after start time.

- [ ] T009 [US1] `setMyRsvpAction` in `app/[locale]/(app)/events/actions.ts`: `requireMember`, club-scoped, sets RSVP for `ctx.member.id` only; guards occurrence open (derived) + belongs to club; upsert (occurrence, member). Returns ok | CLOSED | NOT_FOUND | INVALID_INPUT.
- [ ] T010 [US1] Member view `app/[locale]/(app)/events/page.tsx`: "Tento týden" list of `listOpenThisWeek` occurrences (date/time/place, going-count, my status), empty-state when none.
- [ ] T011 [US1] Occurrence detail `app/[locale]/(app)/events/[occurrenceId]/page.tsx`: who's-coming roster + big going-headcount + low-turnout line + my RSVP control; closed/cancelled states read-only.
- [ ] T012 [P] [US1] `components/events/rsvp-toggle.tsx` (Přijdu/Nejdu, optimistic, disabled when closed/pending → `setMyRsvpAction`) and `components/events/who-is-coming.tsx` (roster rows w/ MemberAvatar + status; headcount; low-turnout line).
- [ ] T013 [US1] Add the Events entry to `components/nav/bottom-nav.tsx`; fill US1 i18n keys (cs+en).
- [ ] T014 [P] [US1] Integration `tests/integration/event-rsvp.spec.ts`: member upserts own RSVP (going→not_going overwrites, one row); RSVP on a closed occurrence → CLOSED; cross-club occurrence → NOT_FOUND.
- [ ] T015 [P] [US1] Component `tests/component/rsvp-toggle.spec.tsx`: toggling calls the action with the occurrence id + status; disabled when closed.

**Checkpoint**: a member can RSVP to an existing session — usable MVP slice.

---

## Phase 4: User Story 2 — Set up a recurring weekly session (P1)

**Goal**: admin defines a series; occurrences appear + keep generating.

**Independent test**: admin creates Tue 17:00 → this week's Tuesday is open; re-running generation creates no duplicates.

- [ ] T016 [US2] `createSeriesAction` + `updateSeriesAction` in `events/actions.ts`: `requireRole('club_admin')`; validate; create active series; after create call `ensureOccurrences` so the current week's occurrence appears immediately.
- [ ] T017 [US2] Admin series UI `app/[locale]/(app)/admin/events/` (page + `components/events/series-form.tsx`): list series, create/edit (weekday picker, time, place). No native date/time inputs (forms:check) — weekday via select, time via the project's input convention.
- [ ] T018 [US2] Cron route `app/api/cron/events/route.ts`: verify `Authorization: Bearer $CRON_SECRET` (401 otherwise), run `ensureOccurrences` for all clubs' active series, return `{ok,created}`; add nightly schedule to `vercel.json`; document `CRON_SECRET` in `.env.example`.
- [ ] T019 [P] [US2] Integration `tests/integration/event-generation.spec.ts`: `ensureOccurrences` creates the next N weekly dates for an active series; **re-run inserts nothing** (idempotent) and leaves existing RSVPs untouched; inactive series generates nothing.
- [ ] T020 [P] [US2] Component `tests/component/series-form.spec.tsx`: valid submit calls `createSeriesAction` with weekday/time/place; validation errors render in-app.

**Checkpoint**: admin sets up a series once; members RSVP every week; cron keeps future weeks topped up. **MVP complete (US1+US2).**

---

## Phase 5: User Story 3 — Adjust or cancel a session (P2)

- [ ] T021 [US3] `cancelOccurrenceAction` + `deactivateSeriesAction` in `events/actions.ts` (`requireRole('club_admin')`, club-scoped, soft: status/flag).
- [ ] T022 [US3] Admin controls: cancel an upcoming occurrence + deactivate a series in `admin/events/`; member views show cancelled occurrences as non-RSVP-able. i18n.

---

## Phase 6: User Story 4 — Admin on-behalf RSVP (P2)

- [ ] T023 [US4] `setMemberRsvpAction` in `events/actions.ts`: `requireRole('club_admin')` ONLY, `memberId` must be in club, same upsert (setByUserId = admin).
- [ ] T024 [US4] On the occurrence detail, render per-member set controls ONLY when the viewer is a club_admin (the sejdemse fix — invisible to regular members). i18n.
- [ ] T025 [P] [US4] Integration `tests/integration/event-rsvp-onbehalf.spec.ts`: admin sets another member's status (attributed to admin); a non-admin calling `setMemberRsvpAction` for someone else → FORBIDDEN.

---

## Phase 7: User Story 5 — Optional beer-session link (P3)

- [ ] T026 [US5] Associate the evening's drink session with an occurrence (admin action or most-recent-occurrence heuristic) + show a "beers from this night →" link on the occurrence detail when `drink_sessions.occurrence_id` is set. Verify a non-event session (occurrence_id null) is unaffected (no integration test needed beyond the existing session tests — additive FK).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T027 Wire it together review: bottom-nav placement, locale/date formatting (Intl, club locale), avatars on the roster, playful tone of the low-turnout line.
- [ ] T028 Gates: `pnpm typecheck`, `lint`, `test:unit`, `test:integration`, `test:component`, `build`, `i18n:check`, `forms:check` — all green. (E2E N/A.)
- [ ] T029 Update CLAUDE.md shipped-log (between SPECKIT markers) for spec 032; note `CRON_SECRET` + the Vercel cron in deploy notes.

---

## Dependencies & order

- **Phase 2** blocks all stories (schema + pure logic + queries).
- **US1 (P1)** and **US2 (P1)** together are the MVP; US1 needs an occurrence to exist (seed one manually or via US2's create). Build US2's create first if you want a real occurrence to RSVP against, or seed in the test.
- US3/US4/US5 are independent of each other, after the MVP.
- Cron (T018) depends on `ensureOccurrences` (T008); create-action seeding (T016) makes the MVP usable even before the cron runs.

## Parallel opportunities

- T004, T005, T007 (pure libs) parallel; their unit tests T006 parallel.
- Within US1: T014 + T015 parallel. Within US2: T019 + T020 parallel.

## MVP

US1 + US2 (+ the foundational phase + cron). A member can RSVP to admin-created
weekly sessions, who's-coming + headcount, generation runs nightly. US3–US5
layer on after.

## Implementation strategy

Foundational first (schema → migrate → pure helpers + unit tests → validation
→ queries). Then US2 create (gives a real occurrence) + US1 RSVP = working
MVP. Add the cron. Then US3 (admin exceptions), US4 (on-behalf), US5 (beer
link). Gates + shipped-log last. Keep integration tests lean — the date math
lives in unit.
