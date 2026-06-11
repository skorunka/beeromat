# Contracts: Event Attendance (RSVP)

Server Actions follow the project convention: `'use server'`, club-scoped via
`requireMember` / `requireRole`, return `{ ok: true, ... } | { ok: false, code }`.
Zod schemas in `lib/validation/events.ts` are shared client+server.

## Member — set my own RSVP

`setMyRsvpAction({ occurrenceId, status }): Promise<SetRsvpResult>`
- **Authz**: any member (`requireMember`), club-scoped. Sets the RSVP for
  `ctx.member.id` ONLY — `memberId` is never taken from input.
- **Guards**: occurrence must belong to the club and be **open** (derived);
  else `CLOSED` / `NOT_FOUND`.
- **Behaviour**: upsert one row (occurrence, member) → `status`
  (`going`|`not_going`), `setByUserId = ctx.user.id`.
- **Results**: `{ ok:true }` | `{ ok:false, code:'CLOSED'|'NOT_FOUND'|'INVALID_INPUT' }`.

## Admin — set another member's RSVP (on-behalf)

`setMemberRsvpAction({ occurrenceId, memberId, status }): Promise<SetRsvpResult>`
- **Authz**: `requireRole('club_admin')` ONLY (the sejdemse fix — members
  cannot reach this). Club-scoped; `memberId` must be in the same club.
- **Behaviour**: same upsert, `setByUserId = ctx.user.id` (records the admin).
- **Results**: as above + `{ ok:false, code:'FORBIDDEN'|'MEMBER_NOT_IN_CLUB' }`.

## Admin — series management

- `createSeriesAction({ weekday, startLocalTime, placeLabel, title? })` — `requireRole('club_admin')`; validates weekday/time; creates an active series. After create, opportunistically `ensureOccurrences` for it so this week's occurrence appears immediately. `{ ok:true, seriesId } | { ok:false, code }`.
- `updateSeriesAction({ seriesId, patch })` — edit time/place/title/active; affects FUTURE generation only (existing occurrences unchanged).
- `deactivateSeriesAction({ seriesId })` — `isActive=false`; stops generation; past records kept.
- `cancelOccurrenceAction({ occurrenceId })` — `status='cancelled'`; other occurrences unaffected.

## Cron — generate occurrences (Route Handler, not a Server Action)

`GET/POST /api/cron/events`
- **Auth**: verify `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets it);
  reject otherwise (401). NOT user-authenticated.
- **Behaviour**: for every club's active series, `ensureOccurrences` (insert
  the next ~4–6 weekly dates not already present; `onConflictDoNothing`).
  Idempotent. Returns `{ ok:true, created: N }`.
- **Schedule**: `vercel.json` cron, nightly (e.g. `0 2 * * *`).

## Read queries (`lib/db/queries/events.ts`)

- `listOpenThisWeek(clubId, now)` — the current-week, not-yet-started,
  scheduled occurrences across active series, each with going-headcount (+
  the caller's own status for quick render).
- `getOccurrenceDetail(occurrenceId, clubId)` — occurrence + roster with each
  member's status + going-count + optional linked drink-session id.
- `listSeries(clubId)` — for admin management.

## Pure helpers (`lib/events/`) — unit-tested, no DB

- `currentPragueWeek(now): { start, endExclusive }` — Mon 00:00 → next Mon, Europe/Prague.
- `isOccurrenceOpen({ status, occurrenceDate, startsAt }, now): boolean`.
- `pragueLocalToInstant(date, 'HH:MM'): Date` — DST-aware local→UTC.
- `nextOccurrenceDates(weekday, fromDate, horizonWeeks): Date[]` — generation dates.
- `lowTurnoutMessageKey(goingCount): string | null` — which playful line (if any).

## Validation schemas (Zod)

- `createSeriesSchema = { weekday: 1..7, startLocalTime: /^\d{2}:\d{2}$/, placeLabel: 1..80, title?: 1..80 }`
- `setRsvpSchema = { occurrenceId: uuid, status: enum(going,not_going) }`
- `setMemberRsvpSchema = setRsvpSchema + { memberId: uuid }`
