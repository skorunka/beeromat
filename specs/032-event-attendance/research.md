# Research: Event Attendance (RSVP)

## Decision 1 — "Open for RSVP" is DERIVED, not a stored flag

**Decision**: Don't store/flip an `open` flag. Derive it:
`open ⇔ status = 'scheduled' AND occurrenceDate within the current Prague
week AND now < startsAt`. The cron only **generates** occurrences.

**Rationale**: A flag the cron flips makes correctness depend on the cron
running exactly once at the right time — a missed/late/double run leaves
wrong state. Deriving from `now` is always correct regardless of cron timing,
and makes the cron trivially idempotent (insert-if-missing only).

**Alternatives**: stored `open` flag flipped nightly — rejected (fragile to
cron timing); open everything always — rejected (spec wants current-week
window).

## Decision 2 — Timezone / DST (Europe/Prague) without a heavy dependency

**Decision**: Persist each occurrence's `startsAt` as an absolute
`timestamptz`, computed at generation time from the series' (weekday,
local-time) interpreted in **Europe/Prague**, DST-aware. Compute the
Prague offset for a given calendar date with `Intl.DateTimeFormat` (the
`timeZoneName: 'shortOffset'` / formatToParts trick) — a tiny pure helper,
no new dependency. The current-week boundary (Mon 00:00 Prague →
next Mon 00:00) is computed the same way. Store `occurrenceDate` (the local
calendar date, for week-bucketing + display) alongside `startsAt`.

**Rationale**: Storing an absolute instant means "has it started?" is a plain
`now >= startsAt` comparison anywhere. Doing the local→UTC conversion once
at generation keeps the DST hazard in one tested pure helper. Constitution
VII prefers no dependency churn; Intl is built in and sufficient.

**Alternatives**: store naive local time + convert on read — rejected (DST
ambiguity scattered across call sites); add `date-fns-tz`/Temporal — rejected
for now (avoidable dep / Temporal still flagged in Node 24). Revisit only if
the Intl helper proves insufficient.

**Care-point**: unit-test the helper across a DST transition (late-March /
late-October Prague) so a 17:00 session is the right UTC instant both sides.

## Decision 3 — Cron: Vercel Cron → secret-guarded Route Handler

**Decision**: A nightly Vercel Cron entry in `vercel.json` hits
`/api/cron/events`. The handler verifies the request is from Vercel Cron
(check the `Authorization: Bearer $CRON_SECRET` header against an env
`CRON_SECRET`; Vercel sets it automatically) and runs `ensureOccurrences`
for every club's active series. Returns a small JSON summary.

**Rationale**: Native to the Vercel deploy, free-tier (Hobby allows daily
cron), no extra infra (constitution VI). The secret guard prevents the
public route from being triggered by anyone.

**Alternatives**: external scheduler — rejected (extra infra); generate
lazily on first read each day — rejected (couples generation to user traffic;
the spec explicitly wants overnight generation). Note: even with the cron,
`listOpenThisWeek` is resilient if an occurrence is somehow missing — but the
cron is the intended path.

## Decision 4 — Idempotent generation

**Decision**: `ensureOccurrences` inserts the next ~4–6 weekly dates per
active series that don't already exist, guarded by a **unique index on
(series_id, occurrence_date)** + `onConflictDoNothing`. Re-running inserts
nothing new and never touches existing rows (so RSVPs are safe).

**Rationale**: The constitution's "verify idempotency" + Decision 1 both
demand a re-runnable generator. The unique index makes it bulletproof at the
DB layer.

## Decision 5 — RSVP is a mutable status (not an append-only domain event)

**Decision**: `event_rsvps` is one row per (occurrence, member) holding the
current status (`going` / `not_going`), upserted on change; no per-change
history. Records `setByUserId` (self vs admin) + `updatedAt`.

**Rationale**: Principle V's append-only rule targets money/stock domain
events; an RSVP is a preference like display-name/locale, where the current
value is what matters. Keeping history would be over-engineering for "am I
coming Tuesday". Attribution (who set it) covers the admin-on-behalf audit
need.

**Alternatives**: append-only RSVP log — rejected (no value, more flake
surface, against the trim-tests principle).

## Decision 6 — Optional, additive occurrence ↔ drink-session link

**Decision**: Add a nullable `occurrence_id` FK on `drink_sessions`
(`onDelete: set null`). Nothing else about sessions changes. The occurrence
detail shows a link to the session's tab when present. Associating the
evening's session with the just-played occurrence is a light admin/most-
recent-occurrence heuristic (plan detail); default is unlinked.

**Rationale**: Matches the user's "not a rule" constraint — a random-Wednesday
session simply has `occurrence_id = null` and behaves as today. One nullable
FK is the whole schema cost; beer logging already serves everyone (FR-012).

**Alternatives**: a join table (many sessions ↔ one occurrence) — rejected
(an evening is one session; 1:1-optional is simpler); make sessions require an
occurrence — rejected outright (breaks ad-hoc play, the user's explicit case).

## Decision 7 — Headcount + low-turnout line

**Decision**: Headcount = count of `going` RSVPs for the occurrence.
"No answer" (no row) and `not_going` don't count. A pure threshold picks the
playful low-turnout message (beeromat tone) below some small N.

**Rationale**: Matches sejdemse's count + "Je to bída :(" morale line, in the
app's voice. Threshold + message are pure → unit-testable.
