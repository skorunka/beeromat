import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string };
    club: { id: string };
  },
};
vi.mock('@/lib/auth/session', () => ({
  requireMember: async () => ctxRef.current!,
  requireRole: async () => ctxRef.current!,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { clearMyRsvpAction, setMyRsvpAction } from '@/app/[locale]/(app)/events/actions';
import { currentPragueWeekDates } from '@/lib/events/window';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { eventOccurrences, eventRsvps, eventSeries } from '@/lib/db/schema/events';

async function seedClub(name: string) {
  const [club] = await testDb
    .insert(clubs)
    .values({ name, currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: u!.id,
      email: u!.email,
      displayName: name,
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  const [series] = await testDb
    .insert(eventSeries)
    .values({
      clubId: club!.id,
      weekday: 2,
      startLocalTime: '17:00',
      placeLabel: 'Antuka',
      createdByUserId: u!.id,
    })
    .returning();
  return { club: club!, user: u!, member: member!, series: series! };
}

async function addOccurrence(
  c: Awaited<ReturnType<typeof seedClub>>,
  startsAt: Date,
): Promise<string> {
  // Date within the current Prague week so the only open-gate is startsAt.
  const { sunday } = currentPragueWeekDates(new Date());
  const [row] = await testDb
    .insert(eventOccurrences)
    .values({
      clubId: c.club.id,
      seriesId: c.series.id,
      occurrenceDate: sunday,
      startsAt,
      placeLabel: 'Antuka',
    })
    .returning();
  return row!.id;
}

function actAs(c: Awaited<ReturnType<typeof seedClub>>) {
  ctxRef.current = {
    user: { id: c.user.id },
    member: { id: c.member.id, role: 'member' },
    club: { id: c.club.id },
  };
}

const FUTURE = new Date(Date.now() + 2 * 86400_000);
const PAST = new Date(Date.now() - 3600_000);

describe('setMyRsvpAction (spec 032)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('upserts the member own status; switching overwrites (one row)', async () => {
    const a = await seedClub('A');
    const occId = await addOccurrence(a, FUTURE);
    actAs(a);

    expect((await setMyRsvpAction({ occurrenceId: occId, status: 'going' })).ok).toBe(true);
    let rows = await testDb.select().from(eventRsvps).where(eq(eventRsvps.occurrenceId, occId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('going');

    expect((await setMyRsvpAction({ occurrenceId: occId, status: 'not_going' })).ok).toBe(true);
    rows = await testDb.select().from(eventRsvps).where(eq(eventRsvps.occurrenceId, occId));
    expect(rows).toHaveLength(1); // overwrite, not a second row
    expect(rows[0]!.status).toBe('not_going');
  });

  it('clearMyRsvpAction resets the vote — deletes the row (back to no answer)', async () => {
    const a = await seedClub('A');
    const occId = await addOccurrence(a, FUTURE);
    actAs(a);

    await setMyRsvpAction({ occurrenceId: occId, status: 'going' });
    expect((await clearMyRsvpAction({ occurrenceId: occId })).ok).toBe(true);

    const rows = await testDb.select().from(eventRsvps).where(eq(eventRsvps.occurrenceId, occId));
    expect(rows).toHaveLength(0);
  });

  it('rejects RSVP on a closed (already-started) occurrence', async () => {
    const a = await seedClub('A');
    const occId = await addOccurrence(a, PAST);
    actAs(a);
    const r = await setMyRsvpAction({ occurrenceId: occId, status: 'going' });
    expect(r).toEqual({ ok: false, code: 'CLOSED' });
  });

  it('cannot RSVP to another club occurrence (club-scoped → NOT_FOUND)', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    const occB = await addOccurrence(b, FUTURE);
    actAs(a); // acting in club A
    const r = await setMyRsvpAction({ occurrenceId: occB, status: 'going' });
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
