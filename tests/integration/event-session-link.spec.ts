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

import { setOccurrenceSessionAction } from '@/app/[locale]/(app)/events/actions';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { eventOccurrences, eventSeries } from '@/lib/db/schema/events';
import { drinkSessions } from '@/lib/db/schema/sessions';

async function seed() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'A', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [u] = await testDb
    .insert(users)
    .values({ email: `a-${Math.random()}@x.test`, name: 'A', emailVerified: true })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: u!.id,
      email: u!.email,
      displayName: 'Admin',
      role: 'club_admin',
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
  const [occ] = await testDb
    .insert(eventOccurrences)
    .values({
      clubId: club!.id,
      seriesId: series!.id,
      occurrenceDate: '2026-06-16',
      startsAt: new Date(),
      placeLabel: 'Antuka',
    })
    .returning();
  const mkSession = async () => {
    const [s] = await testDb
      .insert(drinkSessions)
      // endedAt set → closed; the partial unique index only allows one OPEN
      // (endedAt null) session per club, and we need two candidates here.
      .values({ clubId: club!.id, startedAt: new Date(), endedAt: new Date(), openedByUserId: u!.id })
      .returning();
    return s!.id;
  };
  ctxRef.current = {
    user: { id: u!.id },
    member: { id: member!.id, role: 'club_admin' },
    club: { id: club!.id },
  };
  return { occId: occ!.id, sessionA: await mkSession(), sessionB: await mkSession() };
}

const linkedOcc = async (sessionId: string) =>
  (await testDb.select().from(drinkSessions).where(eq(drinkSessions.id, sessionId)))[0]!.occurrenceId;

describe('setOccurrenceSessionAction (spec 032 US5)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('links a session, re-link clears the previous (1:1), then unlinks', async () => {
    const { occId, sessionA, sessionB } = await seed();

    expect((await setOccurrenceSessionAction({ occurrenceId: occId, sessionId: sessionA })).ok).toBe(true);
    expect(await linkedOcc(sessionA)).toBe(occId);

    // Re-link to B: A must be cleared (1:1 per occurrence).
    expect((await setOccurrenceSessionAction({ occurrenceId: occId, sessionId: sessionB })).ok).toBe(true);
    expect(await linkedOcc(sessionA)).toBeNull();
    expect(await linkedOcc(sessionB)).toBe(occId);

    // Unlink: B cleared.
    expect((await setOccurrenceSessionAction({ occurrenceId: occId, sessionId: null })).ok).toBe(true);
    expect(await linkedOcc(sessionB)).toBeNull();
  });
});
