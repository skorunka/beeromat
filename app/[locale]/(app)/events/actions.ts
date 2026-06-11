'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { requireMember, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { eventOccurrences, eventRsvps, eventSeries } from '@/lib/db/schema/events';
import { ensureOccurrences } from '@/lib/db/queries/events';
import { isOccurrenceOpen } from '@/lib/events/window';
import {
  cancelOccurrenceSchema,
  createSeriesSchema,
  setMemberRsvpSchema,
  setRsvpSchema,
  updateSeriesSchema,
} from '@/lib/validation/events';

// Spec 032 — event attendance server actions. Project convention: discriminated
// result, club-scoped via requireMember/requireRole.

export type SetRsvpResult =
  | { ok: true }
  | { ok: false; code: 'CLOSED' | 'NOT_FOUND' | 'INVALID_INPUT' | 'FORBIDDEN' | 'MEMBER_NOT_IN_CLUB' };

// Internal: load the occurrence (club-scoped) and confirm it's open NOW.
type LoadResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'CLOSED' };

async function loadOpenOccurrence(occurrenceId: string, clubId: string): Promise<LoadResult> {
  const occ = await db.query.eventOccurrences.findFirst({
    where: and(eq(eventOccurrences.id, occurrenceId), eq(eventOccurrences.clubId, clubId)),
  });
  if (!occ) return { ok: false, code: 'NOT_FOUND' };
  if (
    !isOccurrenceOpen(
      { status: occ.status, occurrenceDate: occ.occurrenceDate, startsAt: occ.startsAt },
      new Date(),
    )
  ) {
    return { ok: false, code: 'CLOSED' };
  }
  return { ok: true };
}

async function upsertRsvp(args: {
  clubId: string;
  occurrenceId: string;
  memberId: string;
  status: 'going' | 'not_going';
  setByUserId: string;
}): Promise<void> {
  await db
    .insert(eventRsvps)
    .values({
      clubId: args.clubId,
      occurrenceId: args.occurrenceId,
      memberId: args.memberId,
      status: args.status,
      setByUserId: args.setByUserId,
    })
    .onConflictDoUpdate({
      target: [eventRsvps.occurrenceId, eventRsvps.memberId],
      set: { status: args.status, setByUserId: args.setByUserId, updatedAt: new Date() },
    });
}

// US1 — a member sets ONLY their own RSVP.
export async function setMyRsvpAction(input: {
  occurrenceId: string;
  status: 'going' | 'not_going';
}): Promise<SetRsvpResult> {
  const ctx = await requireMember();
  const parsed = setRsvpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  const loaded = await loadOpenOccurrence(parsed.data.occurrenceId, ctx.club.id);
  if (!loaded.ok) return { ok: false, code: loaded.code };

  await upsertRsvp({
    clubId: ctx.club.id,
    occurrenceId: parsed.data.occurrenceId,
    memberId: ctx.member.id,
    status: parsed.data.status,
    setByUserId: ctx.user.id,
  });
  revalidatePath('/events');
  revalidatePath(`/events/${parsed.data.occurrenceId}`);
  return { ok: true };
}

// US4 — admin-only on-behalf: set ANOTHER member's RSVP.
export async function setMemberRsvpAction(input: {
  occurrenceId: string;
  memberId: string;
  status: 'going' | 'not_going';
}): Promise<SetRsvpResult> {
  const ctx = await requireRole('club_admin');
  const parsed = setMemberRsvpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  const target = await db.query.members.findFirst({
    where: and(eq(members.id, parsed.data.memberId), eq(members.clubId, ctx.club.id)),
  });
  if (!target) return { ok: false, code: 'MEMBER_NOT_IN_CLUB' };

  const loaded = await loadOpenOccurrence(parsed.data.occurrenceId, ctx.club.id);
  if (!loaded.ok) return { ok: false, code: loaded.code };

  await upsertRsvp({
    clubId: ctx.club.id,
    occurrenceId: parsed.data.occurrenceId,
    memberId: parsed.data.memberId,
    status: parsed.data.status,
    setByUserId: ctx.user.id,
  });
  revalidatePath(`/events/${parsed.data.occurrenceId}`);
  return { ok: true };
}

export type SeriesResult =
  | { ok: true; seriesId: string }
  | { ok: false; code: 'INVALID_INPUT' };

// US2 — admin creates a recurring series; seed this week's occurrence now.
export async function createSeriesAction(input: unknown): Promise<SeriesResult> {
  const ctx = await requireRole('club_admin');
  const parsed = createSeriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  const [row] = await db
    .insert(eventSeries)
    .values({
      clubId: ctx.club.id,
      weekday: parsed.data.weekday,
      startLocalTime: parsed.data.startLocalTime,
      placeLabel: parsed.data.placeLabel,
      title: parsed.data.title ?? null,
      createdByUserId: ctx.user.id,
    })
    .returning({ id: eventSeries.id });

  await ensureOccurrences(new Date(), ctx.club.id);
  revalidatePath('/admin/events');
  revalidatePath('/events');
  return { ok: true, seriesId: row!.id };
}

export type MutateResult = { ok: true } | { ok: false; code: 'INVALID_INPUT' | 'NOT_FOUND' };

// US3 — edit a series (future generation only).
export async function updateSeriesAction(input: unknown): Promise<MutateResult> {
  const ctx = await requireRole('club_admin');
  const parsed = updateSeriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { seriesId, isActive, ...patch } = parsed.data;

  const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (isActive !== undefined) set.isActive = isActive ? 1 : 0;

  const res = await db
    .update(eventSeries)
    .set(set)
    .where(and(eq(eventSeries.id, seriesId), eq(eventSeries.clubId, ctx.club.id)))
    .returning({ id: eventSeries.id });
  if (res.length === 0) return { ok: false, code: 'NOT_FOUND' };
  revalidatePath('/admin/events');
  return { ok: true };
}

// US3 — cancel a single occurrence (soft).
export async function cancelOccurrenceAction(input: unknown): Promise<MutateResult> {
  const ctx = await requireRole('club_admin');
  const parsed = cancelOccurrenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  const res = await db
    .update(eventOccurrences)
    .set({ status: 'cancelled' })
    .where(
      and(eq(eventOccurrences.id, parsed.data.occurrenceId), eq(eventOccurrences.clubId, ctx.club.id)),
    )
    .returning({ id: eventOccurrences.id });
  if (res.length === 0) return { ok: false, code: 'NOT_FOUND' };
  revalidatePath('/events');
  revalidatePath('/admin/events');
  return { ok: true };
}
