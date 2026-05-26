import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = { current: null as null | {
  user: { id: string };
  member: { id: string; role: string };
  club: { id: string };
} };
vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireMember: async () => ctxRef.current!,
}));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { dismissOnBehalfReviewAction } from '@/app/[locale]/(app)/log/actions';

async function seedClubWithTwoMembersAndBeer() {
  const [userA] = await testDb
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `a-${Date.now()}-${Math.random()}@example.test`, name: 'Alice' })
    .returning();
  const [userB] = await testDb
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `b-${Date.now()}-${Math.random()}@example.test`, name: 'Bob' })
    .returning();
  if (!userA || !userB) throw new Error('seed users');

  const [club] = await testDb
    .insert((await import('@/lib/db/schema/clubs')).clubs)
    .values({ name: 'Test Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [memberA] = await testDb
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userA.id, email: userA.email, displayName: 'Alice', role: 'member' })
    .returning();
  const [memberB] = await testDb
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userB.id, email: userB.email, displayName: 'Bob', role: 'member' })
    .returning();
  if (!memberA || !memberB) throw new Error('seed members');

  const [session] = await testDb
    .insert((await import('@/lib/db/schema/sessions')).drinkSessions)
    .values({ clubId: club.id, openedByUserId: userA.id, startedAt: new Date() })
    .returning();
  if (!session) throw new Error('seed session');

  const [beer] = await testDb
    .insert((await import('@/lib/db/schema/catalog')).beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: userA.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');

  return { club, userA, userB, memberA, memberB, session, beer };
}

async function seedOnBehalfConsumption(args: {
  clubId: string;
  sessionId: string;
  targetMemberId: string;
  beerId: string;
  loggerUserId: string;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await testDb
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.sessionId,
      memberId: args.targetMemberId,
      beerTypeId: args.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: args.loggerUserId,
    })
    .returning();
  if (!c) throw new Error('seed consumption');
  return c;
}

describe('dismissOnBehalfReviewAction (spec 019)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('stamps on_behalf_reviewed_at when the consumer dismisses their own on-behalf log', async () => {
    const { club, userA, userB, memberB, session, beer } = await seedClubWithTwoMembersAndBeer();
    const consumption = await seedOnBehalfConsumption({
      clubId: club.id,
      sessionId: session.id,
      targetMemberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });

    // Bob (consumer) dismisses.
    ctxRef.current = {
      user: { id: userB.id },
      member: { id: memberB.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await dismissOnBehalfReviewAction({ consumptionId: consumption.id });
    expect(result.ok).toBe(true);

    const { consumptions } = await import('@/lib/db/schema/consumption');
    const [updated] = await testDb
      .select()
      .from(consumptions)
      .where(eq(consumptions.id, consumption.id));
    expect(updated?.onBehalfReviewedAt).not.toBeNull();
  });

  it('rejects NOT_AUTHORIZED when a different member tries to dismiss', async () => {
    const { club, userA, memberA, memberB, session, beer } = await seedClubWithTwoMembersAndBeer();
    const consumption = await seedOnBehalfConsumption({
      clubId: club.id,
      sessionId: session.id,
      targetMemberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });

    // Alice (not the consumer) tries to dismiss.
    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await dismissOnBehalfReviewAction({ consumptionId: consumption.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('NOT_AUTHORIZED');
  });

  it('returns ALREADY_REVIEWED when called twice on the same row', async () => {
    const { club, userA, userB, memberB, session, beer } = await seedClubWithTwoMembersAndBeer();
    const consumption = await seedOnBehalfConsumption({
      clubId: club.id,
      sessionId: session.id,
      targetMemberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });
    const { consumptions } = await import('@/lib/db/schema/consumption');
    await testDb
      .update(consumptions)
      .set({ onBehalfReviewedAt: new Date() })
      .where(eq(consumptions.id, consumption.id));

    ctxRef.current = {
      user: { id: userB.id },
      member: { id: memberB.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await dismissOnBehalfReviewAction({ consumptionId: consumption.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('ALREADY_REVIEWED');
  });

  it('returns NOT_FOUND when the consumption does not exist', async () => {
    const { club, userB, memberB } = await seedClubWithTwoMembersAndBeer();
    ctxRef.current = {
      user: { id: userB.id },
      member: { id: memberB.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await dismissOnBehalfReviewAction({
      consumptionId: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('NOT_FOUND');
  });
});
