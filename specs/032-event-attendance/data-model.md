# Data Model: Event Attendance (RSVP)

All new tables carry `club_id` (Principle II). Times stored as `timestamptz`;
`occurrence_date` is the local (Prague) calendar date for week-bucketing.

## event_series  *(NEW)*
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `clubId` | uuid FK → clubs | club-scoped, onDelete restrict |
| `weekday` | smallint (0–6) | ISO: 1=Mon … 7=Sun (pick one convention, document) |
| `startLocalTime` | text `'HH:MM'` (or `time`) | wall-clock time in Europe/Prague |
| `placeLabel` | text | e.g. "Antuka" |
| `title` | text nullable | optional label; else derived ("Úterý 17:00") |
| `isActive` | boolean default true | deactivation stops generation; soft |
| `createdByUserId` | uuid FK → users | |
| `createdAt` / `updatedAt` | timestamptz | |

## event_occurrences  *(NEW)*
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `clubId` | uuid FK → clubs | denormalized for scoping/queries |
| `seriesId` | uuid FK → event_series | onDelete cascade |
| `occurrenceDate` | date | local Prague calendar date |
| `startsAt` | timestamptz | absolute instant (local time → UTC, DST-aware) |
| `placeLabel` | text | snapshot from series at generation (edits to series don't rewrite existing) |
| `status` | enum `scheduled` \| `cancelled` | soft cancel |
| `createdAt` | timestamptz | |
| | | **UNIQUE (series_id, occurrence_date)** — idempotent generation guard |

- **Open (derived, not stored)**: `status='scheduled' AND occurrenceDate in current Prague week AND now < startsAt`.
- Past/closed occurrences stay readable (record of who said they'd come).

## event_rsvps  *(NEW)*
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `clubId` | uuid FK → clubs | |
| `occurrenceId` | uuid FK → event_occurrences | onDelete cascade |
| `memberId` | uuid FK → members | |
| `status` | enum `going` \| `not_going` | absence of row = "no answer" |
| `setByUserId` | uuid FK → users | who set it (self vs admin-on-behalf) |
| `updatedAt` | timestamptz | |
| | | **UNIQUE (occurrence_id, member_id)** — one status per member per occurrence (upsert) |

## drink_sessions  *(MODIFY — existing)*
| Field | Type | Notes |
|---|---|---|
| `occurrenceId` | uuid FK → event_occurrences **nullable** | onDelete set null. The optional, additive evening link. Null for ad-hoc (non-event) sessions — unchanged behaviour. |

## Relationships

- club 1—* series 1—* occurrence 1—* rsvp
- occurrence 0..1 —— 0..1 drink_session (optional, via the nullable FK)
- rsvp.member → members (the existing roster)

## Validation / rules (from requirements)

- One RSVP row per (occurrence, member); changing status upserts (FR-005).
- RSVP write allowed iff occurrence is **open** (FR-004) AND (actor is the member themselves OR actor is club_admin) (FR-006).
- Headcount = count of `going` for an occurrence (FR-007).
- Generation: insert the next N weekly dates per active series not already present; never modifies/deletes existing (FR-002, idempotent).
- Cancel = set `status='cancelled'`; deactivate series = `isActive=false`; both soft, past records preserved (FR-009).
- All queries filtered by `club_id` (FR-010); no cross-club.

## Invariants

- **Idempotent generation**: unique (series_id, occurrence_date) + conflict-do-nothing ⇒ re-runs change nothing, RSVPs preserved.
- **Open-state purely a function of `now`** ⇒ no stored flag can drift from reality.
- **Event-optional**: a drink session with `occurrence_id = null` behaves exactly as before this feature (no regression to beer/match flows).
