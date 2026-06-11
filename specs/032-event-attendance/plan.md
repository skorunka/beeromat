# Implementation Plan: Event Attendance (RSVP)

**Branch**: `032-event-attendance` (authored on `main` — trunk-based) | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-event-attendance/spec.md`

## Summary

Add a recurring-session RSVP layer to beeromat (replacing sejdemse): admins
define weekly **series** (weekday + time + place); a nightly **cron** keeps
**occurrences** populated a few weeks ahead; members set their own
going/not-going for the **current week's not-yet-started** occurrences; the
occurrence view shows a who's-coming list + going-headcount + a playful
low-turnout line. Admin-only on-behalf RSVP (the sejdemse safety fix). An
occurrence may **optionally** link to that evening's existing drink session —
additive only; beer/matches are never gated on events.

**Key design refinement (vs the spec's prose):** "open for RSVP" is
**derived at query time** — `open ⇔ status=scheduled AND date in current
Prague week AND now < startsAt` — rather than a flag the cron flips. So the
cron's only job is **idempotent generation** of missing occurrences; nothing
to "open/close" imperatively. This makes the whole thing robust to a missed
or doubled cron run.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict)
**Primary Dependencies**: Next.js 16 (App Router, Route Handlers for the cron), Drizzle ORM 0.45.x, next-intl, react-hook-form + Zod, base-ui
**Storage**: Neon Postgres (club-scoped, multi-tenant)
**Scheduling**: Vercel Cron (nightly) → a secret-guarded Route Handler
**Testing**: Vitest unit (date/week math — pure) + integration (PGlite, the RSVP/generation queries) + component (RTL/jsdom). Playwright E2E dormant.
**Target Platform**: Mobile-first PWA; admin series management also on desktop
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: RSVP toggle feels instant (optimistic + refresh); cron processes a single club's series well under its window.
**Constraints**: club-scoped; timezone-correct week + start-time (Europe/Prague, DST-aware); free-tier (Vercel Cron nightly is within Hobby limits); reuse existing roles/members/avatars/session model.
**Scale/Scope**: one club, tens of members, a handful of series, low-dozens of live occurrences.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. Member RSVP is a one-tap mobile flow; admin series setup is operational (desktop-friendly) but works on phone.
- **II. Tenant-Aware, Single-Club UX** — PASS. `club_id` on every new table; all reads/writes club-scoped; admin-UI-driven config (series), not env.
- **III. Track, Don't Transact** — PASS. No money; the optional drink-session link doesn't change money flows.
- **IV. Auth** — PASS. Self-RSVP for members; series management + on-behalf gated to `club_admin` via the existing role hierarchy.
- **V. Auditable History (No Hard Deletes)** — PASS. An **RSVP is a mutable status/preference** (like display name or locale), NOT one of Principle V's append-only *domain events* (consumptions/payments/stock) — overwriting it is correct, not a hard delete. Occurrence cancellation and series deactivation are **soft** (status/flag), preserving past records. Generation only inserts-if-missing (deletes nothing). Each RSVP records who set it (self vs admin) for attribution.
- **VI. Free-Tier First** — PASS. Vercel Cron nightly is within Hobby limits; no new paid infra.
- **VII. Fresh Code Hygiene** — PASS. Aim for **no new dependency**; timezone math via a small Europe/Prague offset helper (see research) rather than a date-lib bump. If a tz helper proves necessary, it's justified in research, not a stack change.
- **VIII. Testing Pyramid** — see declaration.

### Test layer declaration

Pyramid-honest (per memory `feedback_test_only_what_deserves` — push logic
down, keep integration lean):

- **Unit (`pnpm test:unit`)** — the **bulk**, because the tricky logic is pure: "is this occurrence open?" (now + startsAt + current-week test), the week-window boundary (Mon–Sun Europe/Prague), and "next N dated occurrences for a weekday" generation math. All pure functions, no DB → unit. Plus the Zod schemas (create-series, set-RSVP).
- **Integration (`pnpm test:integration`)** — lean: the RSVP upsert query (one-per-member-per-occurrence, self vs admin-on-behalf authz, club scope) and the occurrence-generation query (idempotent: re-run inserts nothing new). NOT re-testing the pure date math here.
- **Component (`pnpm test:component`)** — the member RSVP control (going/not-going toggle, optimistic state, closed-occurrence disabled), the who's-coming list + headcount + low-turnout line, the admin series form.
- **E2E (`pnpm test:e2e`)** — **N/A**. Playwright stack dormant; the risk is in the pure date logic (unit) + the upsert/authz (integration), both covered cheaply. Consistent with specs 030/031.

## Project Structure

### Documentation (this feature)

```text
specs/032-event-attendance/
├── plan.md · research.md · data-model.md · quickstart.md · contracts/
└── tasks.md   (Phase 2 — /speckit-tasks)
```

### Source Code (repository root)

```text
lib/db/schema/
└── events.ts                    # NEW — event_series, event_occurrences, event_rsvps; + optional occurrenceId on drink_sessions
drizzle/
└── NNNN_*.sql                   # NEW — migration for the above

lib/events/
├── window.ts                    # NEW (PURE) — current Prague week [start,end), isOpen(occurrence, now), nextOccurrenceDates(series, horizon)
└── prague-time.ts               # NEW (PURE) — DST-aware local-weekday+time -> UTC instant for Europe/Prague (no heavy dep)

lib/db/queries/events.ts         # NEW — listOpenThisWeek(clubId), occurrenceDetail, ensureOccurrences (idempotent generation), series CRUD reads
lib/validation/events.ts         # NEW — createSeriesSchema, setRsvpSchema (+ admin on-behalf variant)

app/[locale]/(app)/events/
├── page.tsx                     # NEW — "this week" list of open occurrences (member view)
├── actions.ts                   # NEW — setMyRsvpAction, setMemberRsvpAction (admin), cancelOccurrenceAction, series CRUD actions
└── [occurrenceId]/page.tsx      # NEW — occurrence detail: who's coming + headcount + RSVP control (+ optional beer-session link)

app/[locale]/(app)/admin/events/ # NEW — series management (create/edit/deactivate, cancel an occurrence)
app/api/cron/events/route.ts     # NEW — nightly generation; guarded by CRON_SECRET
vercel.json                      # NEW/MODIFY — cron schedule entry

components/events/                # NEW — rsvp-toggle, who-is-coming list, series-form, low-turnout line
components/nav/bottom-nav.tsx     # MODIFY — add the events entry
messages/cs.json, messages/en.json # MODIFY — events.* namespace
```

**Structure Decision**: Single Next.js App Router app. New `events` domain
(schema + pure `lib/events` helpers + queries + a member `/events` surface +
admin management + a cron Route Handler). The pure window/time helpers carry
the hard logic so it's unit-tested; the cron is generation-only because
open-state is derived. The drink-session tie is one nullable FK + a link in
the UI — additive.

## Complexity Tracking

*No constitution violations to justify. Two items are flagged in research as
care-points (not violations): timezone/DST correctness for the week +
start-time boundary, and securing the cron route — both have standard,
free-tier, dependency-light solutions.*
