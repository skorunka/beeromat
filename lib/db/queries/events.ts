import 'server-only';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';
import {
  eventOccurrences,
  eventRsvps,
  eventSeries,
  type EventSeries,
} from '@/lib/db/schema/events';
import { pragueDateParts, pragueLocalToInstant } from '@/lib/events/prague-time';
import { nextOccurrenceDates, OPEN_WINDOW_DAYS } from '@/lib/events/window';

const GENERATION_HORIZON_WEEKS = 5;

// ── Generation (idempotent) ──────────────────────────────────────────
// Insert the next N weekly dates for each active series that don't already
// exist. Safe to re-run (unique series_id+occurrence_date + do-nothing);
// never touches existing rows, so RSVPs are preserved. Optionally scoped to
// one club. Returns how many occurrences were created.
export async function ensureOccurrences(now: Date, clubId?: string): Promise<number> {
  const seriesRows = await db
    .select()
    .from(eventSeries)
    .where(
      clubId
        ? and(eq(eventSeries.isActive, 1), eq(eventSeries.clubId, clubId))
        : eq(eventSeries.isActive, 1),
    );
  if (seriesRows.length === 0) return 0;

  const { dateStr: today } = pragueDateParts(now);
  const values = seriesRows.flatMap((s: EventSeries) =>
    nextOccurrenceDates(s.weekday, today, GENERATION_HORIZON_WEEKS).map((date) => ({
      clubId: s.clubId,
      seriesId: s.id,
      occurrenceDate: date,
      startsAt: pragueLocalToInstant(date, s.startLocalTime),
      placeLabel: s.placeLabel,
    })),
  );
  if (values.length === 0) return 0;

  const inserted = await db
    .insert(eventOccurrences)
    .values(values)
    .onConflictDoNothing({
      target: [eventOccurrences.seriesId, eventOccurrences.occurrenceDate],
    })
    .returning({ id: eventOccurrences.id });
  return inserted.length;
}

// ── Member view: this week's open occurrences ────────────────────────
export interface OpenOccurrenceRow {
  occurrenceId: string;
  seriesId: string;
  occurrenceDate: string;
  startsAt: Date;
  placeLabel: string;
  title: string | null;
  weekday: number;
  goingCount: number;
  myStatus: 'going' | 'not_going' | null;
}

// Sessions open for RSVP = scheduled, not yet started, starting within the
// ROLLING OPEN_WINDOW_DAYS from `now`. No correlated raw SQL (which trips the
// bare-column bug): occurrences first, then grouped going-counts + the
// caller's own statuses, merged in JS.
export async function listOpenThisWeek(
  clubId: string,
  memberId: string,
  now: Date,
): Promise<OpenOccurrenceRow[]> {
  const windowEnd = new Date(now.getTime() + OPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const occs = await db
    .select({
      occurrenceId: eventOccurrences.id,
      seriesId: eventOccurrences.seriesId,
      occurrenceDate: eventOccurrences.occurrenceDate,
      startsAt: eventOccurrences.startsAt,
      placeLabel: eventOccurrences.placeLabel,
      title: eventSeries.title,
      weekday: eventSeries.weekday,
    })
    .from(eventOccurrences)
    .innerJoin(eventSeries, eq(eventSeries.id, eventOccurrences.seriesId))
    .where(
      and(
        eq(eventOccurrences.clubId, clubId),
        eq(eventOccurrences.status, 'scheduled'),
        gt(eventOccurrences.startsAt, now),
        lte(eventOccurrences.startsAt, windowEnd),
      ),
    )
    .orderBy(asc(eventOccurrences.startsAt));

  if (occs.length === 0) return [];
  const ids = occs.map((o) => o.occurrenceId);

  const counts = await db
    .select({ occurrenceId: eventRsvps.occurrenceId, going: count() })
    .from(eventRsvps)
    .where(and(inArray(eventRsvps.occurrenceId, ids), eq(eventRsvps.status, 'going')))
    .groupBy(eventRsvps.occurrenceId);
  const countMap = new Map(counts.map((c) => [c.occurrenceId, Number(c.going)]));

  const mine = await db
    .select({ occurrenceId: eventRsvps.occurrenceId, status: eventRsvps.status })
    .from(eventRsvps)
    .where(and(inArray(eventRsvps.occurrenceId, ids), eq(eventRsvps.memberId, memberId)));
  const myMap = new Map(mine.map((m) => [m.occurrenceId, m.status]));

  return occs.map((o) => ({
    ...o,
    goingCount: countMap.get(o.occurrenceId) ?? 0,
    myStatus: myMap.get(o.occurrenceId) ?? null,
  }));
}

// ── Occurrence detail: roster + count + optional beer-session link ───
export interface OccurrenceDetail {
  occurrence: {
    id: string;
    occurrenceDate: string;
    startsAt: Date;
    placeLabel: string;
    title: string | null;
    weekday: number;
    status: 'scheduled' | 'cancelled';
  };
  roster: {
    memberId: string;
    displayName: string;
    avatarKey: string | null;
    avatarUploadAt: Date | null;
    status: 'going' | 'not_going' | null;
    rsvpUpdatedAt: Date | null;
  }[];
  goingCount: number;
  linkedSessionId: string | null;
}

export async function getOccurrenceDetail(
  occurrenceId: string,
  clubId: string,
): Promise<OccurrenceDetail | null> {
  const occ = await db
    .select({
      id: eventOccurrences.id,
      occurrenceDate: eventOccurrences.occurrenceDate,
      startsAt: eventOccurrences.startsAt,
      placeLabel: eventOccurrences.placeLabel,
      status: eventOccurrences.status,
      title: eventSeries.title,
      weekday: eventSeries.weekday,
    })
    .from(eventOccurrences)
    .innerJoin(eventSeries, eq(eventSeries.id, eventOccurrences.seriesId))
    .where(and(eq(eventOccurrences.id, occurrenceId), eq(eventOccurrences.clubId, clubId)))
    .limit(1);
  if (occ.length === 0) return null;
  const o = occ[0]!;

  // Active club roster + each member's status for this occurrence.
  const roster = await db
    .select({
      memberId: members.id,
      displayName: members.displayName,
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
      status: eventRsvps.status,
      rsvpUpdatedAt: eventRsvps.updatedAt,
    })
    .from(members)
    .leftJoin(
      eventRsvps,
      and(eq(eventRsvps.memberId, members.id), eq(eventRsvps.occurrenceId, occurrenceId)),
    )
    .where(and(eq(members.clubId, clubId), eq(members.isActive, true)))
    .orderBy(asc(members.displayName));

  // Present going first, then not-going, then no-answer. Within a responded
  // group, EARLIEST response first — whoever opted in/out first leads.
  // displayName asc from the query is the stable tiebreak for no-answer.
  const statusRank = { going: 0, not_going: 1 } as const;
  const sortedRoster = roster.slice().sort((a, b) => {
    const ra = a.status ? statusRank[a.status] : 2;
    const rb = b.status ? statusRank[b.status] : 2;
    if (ra !== rb) return ra - rb;
    if (a.status && b.status) {
      return (a.rsvpUpdatedAt?.getTime() ?? 0) - (b.rsvpUpdatedAt?.getTime() ?? 0);
    }
    return 0;
  });

  const goingCount = sortedRoster.filter((r) => r.status === 'going').length;

  const linked = await db
    .select({ id: drinkSessions.id })
    .from(drinkSessions)
    .where(eq(drinkSessions.occurrenceId, occurrenceId))
    .limit(1);

  return {
    occurrence: o,
    roster: sortedRoster,
    goingCount,
    linkedSessionId: linked[0]?.id ?? null,
  };
}

// ── Admin: candidate drink sessions to link to an occurrence ─────────
// Recent club sessions that are either unlinked or already linked to THIS
// occurrence (so the current link shows as selected). Newest first.
export interface LinkableSession {
  id: string;
  title: string | null;
  startedAt: Date;
  linked: boolean;
}

export async function listLinkableSessionsForClub(
  clubId: string,
  occurrenceId: string,
  limit = 15,
): Promise<LinkableSession[]> {
  const rows = await db
    .select({
      id: drinkSessions.id,
      title: drinkSessions.title,
      startedAt: drinkSessions.startedAt,
      occurrenceId: drinkSessions.occurrenceId,
    })
    .from(drinkSessions)
    .where(
      and(
        eq(drinkSessions.clubId, clubId),
        or(isNull(drinkSessions.occurrenceId), eq(drinkSessions.occurrenceId, occurrenceId)),
      ),
    )
    .orderBy(desc(drinkSessions.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt,
    linked: r.occurrenceId === occurrenceId,
  }));
}

export async function listSeries(clubId: string) {
  return db
    .select()
    .from(eventSeries)
    .where(eq(eventSeries.clubId, clubId))
    .orderBy(asc(eventSeries.weekday), asc(eventSeries.startLocalTime));
}
