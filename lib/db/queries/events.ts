import 'server-only';
import { and, asc, eq, gt, gte, lte, sql } from 'drizzle-orm';

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
import { currentPragueWeekDates, nextOccurrenceDates } from '@/lib/events/window';

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

export async function listOpenThisWeek(
  clubId: string,
  memberId: string,
  now: Date,
): Promise<OpenOccurrenceRow[]> {
  const { monday, sunday } = currentPragueWeekDates(now);

  const goingCount = sql<number>`(
    select count(*)::int from ${eventRsvps}
    where ${eventRsvps.occurrenceId} = ${eventOccurrences.id}
      and ${eventRsvps.status} = 'going'
  )`;
  const myStatus = sql<'going' | 'not_going' | null>`(
    select ${eventRsvps.status} from ${eventRsvps}
    where ${eventRsvps.occurrenceId} = ${eventOccurrences.id}
      and ${eventRsvps.memberId} = ${memberId}
    limit 1
  )`;

  return db
    .select({
      occurrenceId: eventOccurrences.id,
      seriesId: eventOccurrences.seriesId,
      occurrenceDate: eventOccurrences.occurrenceDate,
      startsAt: eventOccurrences.startsAt,
      placeLabel: eventOccurrences.placeLabel,
      title: eventSeries.title,
      weekday: eventSeries.weekday,
      goingCount,
      myStatus,
    })
    .from(eventOccurrences)
    .innerJoin(eventSeries, eq(eventSeries.id, eventOccurrences.seriesId))
    .where(
      and(
        eq(eventOccurrences.clubId, clubId),
        eq(eventOccurrences.status, 'scheduled'),
        gte(eventOccurrences.occurrenceDate, monday),
        lte(eventOccurrences.occurrenceDate, sunday),
        gt(eventOccurrences.startsAt, now),
      ),
    )
    .orderBy(asc(eventOccurrences.startsAt));
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
    })
    .from(members)
    .leftJoin(
      eventRsvps,
      and(eq(eventRsvps.memberId, members.id), eq(eventRsvps.occurrenceId, occurrenceId)),
    )
    .where(and(eq(members.clubId, clubId), eq(members.isActive, true)))
    .orderBy(asc(members.displayName));

  const goingCount = roster.filter((r) => r.status === 'going').length;

  const linked = await db
    .select({ id: drinkSessions.id })
    .from(drinkSessions)
    .where(eq(drinkSessions.occurrenceId, occurrenceId))
    .limit(1);

  return {
    occurrence: o,
    roster,
    goingCount,
    linkedSessionId: linked[0]?.id ?? null,
  };
}

export async function listSeries(clubId: string) {
  return db
    .select()
    .from(eventSeries)
    .where(eq(eventSeries.clubId, clubId))
    .orderBy(asc(eventSeries.weekday), asc(eventSeries.startLocalTime));
}
