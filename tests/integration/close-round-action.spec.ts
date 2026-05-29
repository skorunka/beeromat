import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';

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
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { closeRoundAction } from '@/app/[locale]/(app)/match/actions';
import { closeOpenRoundTx } from '@/lib/db/queries/sessions';
import { logBeerAction } from '@/app/[locale]/(app)/log/actions';

async function seed() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const { drinkSessions } = await import('@/lib/db/schema/sessions');

  const [user] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@x.test`, name: 'U' })
    .returning();
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: user!.id,
      email: user!.email,
      displayName: 'U',
      role: 'member',
    })
    .returning();
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 50,
      createdByUserId: user!.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: user!.id, startedAt: new Date() })
    .returning();
  return { user: user!, club: club!, member: member!, beer: beer!, session: session! };
}

async function openRounds(clubId: string) {
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  return testDb
    .select()
    .from(drinkSessions)
    .where(and(eq(drinkSessions.clubId, clubId), isNull(drinkSessions.endedAt)));
}

describe('closeRoundAction / closeOpenRoundTx', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('closes the open round (stamps endedAt + closedByUserId)', async () => {
    const { user, club, member, session } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await closeRoundAction();
    expect(result).toEqual({ ok: true });

    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const fresh = await testDb.query.drinkSessions.findFirst({
      where: eq(drinkSessions.id, session.id),
    });
    expect(fresh!.endedAt).not.toBeNull();
    expect(fresh!.closedByUserId).toBe(user.id);
    expect(await openRounds(club.id)).toHaveLength(0);
  });

  it('NO_OPEN_ROUND when there is no open round', async () => {
    const { user, club, member, session } = await seed();
    // Pre-close the seeded session directly.
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    await testDb
      .update(drinkSessions)
      .set({ endedAt: new Date() })
      .where(eq(drinkSessions.id, session.id));

    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    expect(await closeRoundAction()).toEqual({ ok: false, code: 'NO_OPEN_ROUND' });
  });

  it('a second close is a no-op (race-safe guarded UPDATE)', async () => {
    const { user, club } = await seed();
    expect(await closeOpenRoundTx(club.id, user.id)).toEqual({ ok: true });
    expect(await closeOpenRoundTx(club.id, user.id)).toEqual({
      ok: false,
      code: 'NO_OPEN_ROUND',
    });
  });

  it('logging a beer after close opens a FRESH round', async () => {
    const { user, club, member, beer, session } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member', },
      club: { id: club.id },
    };
    await closeRoundAction();
    expect(await openRounds(club.id)).toHaveLength(0);

    // logBeerAction needs the undo-window field on club.
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 } as never,
    };
    const logged = await logBeerAction({ beerTypeId: beer.id });
    expect(logged.ok).toBe(true);

    const open = await openRounds(club.id);
    expect(open).toHaveLength(1);
    // It's a NEW round, not the closed one.
    expect(open[0]!.id).not.toBe(session.id);
  });

  it('only the club\'s own round is closed (Principle II)', async () => {
    const a = await seed();
    const b = await seed();
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.member.id, role: 'member' },
      club: { id: a.club.id },
    };
    await closeRoundAction();
    // Club B's round is untouched.
    expect(await openRounds(b.club.id)).toHaveLength(1);
  });
});
