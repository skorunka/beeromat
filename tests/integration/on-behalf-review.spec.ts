import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { onBehalfReviewSummaryForMember } from '@/lib/db/queries/on-behalf-review';

// Spec 019 T004 — integration coverage for the home banner's
// summary query.

async function seedClubWithTwoMembers(clubName = 'Test Club') {
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
    .values({ name: clubName, currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
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

async function logOnBehalf(args: {
  clubId: string;
  sessionId: string;
  memberId: string;       // the target (absent member)
  beerId: string;
  loggerUserId: string;   // the actor (present member's user)
  reviewedAt?: Date | null;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await testDb
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.sessionId,
      memberId: args.memberId,
      beerTypeId: args.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: args.loggerUserId,
      ...(args.reviewedAt !== undefined ? { onBehalfReviewedAt: args.reviewedAt } : {}),
    })
    .returning();
  if (!c) throw new Error('seed on-behalf consumption');
  return c;
}

describe('onBehalfReviewSummaryForMember (spec 019)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns 0 + [] when no on-behalf consumptions exist for the member', async () => {
    const { club, memberB } = await seedClubWithTwoMembers();
    const result = await onBehalfReviewSummaryForMember(memberB.id, club.id);
    expect(result.count).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('returns one row when an unreviewed on-behalf log exists for the member', async () => {
    const { club, userA, memberB, session, beer } = await seedClubWithTwoMembers();
    await logOnBehalf({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });
    const result = await onBehalfReviewSummaryForMember(memberB.id, club.id);
    expect(result.count).toBe(1);
    expect(result.rows[0]?.loggerDisplayName).toBe('Alice');
    expect(result.rows[0]?.beerName).toBe('Pilsner');
  });

  it('excludes voided on-behalf consumptions', async () => {
    const { club, userA, memberB, session, beer } = await seedClubWithTwoMembers();
    const consumption = await logOnBehalf({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });
    const { consumptionVoids } = await import('@/lib/db/schema/consumption');
    await testDb.insert(consumptionVoids).values({
      clubId: club.id,
      consumptionId: consumption.id,
      voidedByUserId: userA.id,
    });
    const result = await onBehalfReviewSummaryForMember(memberB.id, club.id);
    expect(result.count).toBe(0);
  });

  it('excludes already-reviewed on-behalf consumptions', async () => {
    const { club, userA, memberB, session, beer } = await seedClubWithTwoMembers();
    await logOnBehalf({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
      reviewedAt: new Date(),
    });
    const result = await onBehalfReviewSummaryForMember(memberB.id, club.id);
    expect(result.count).toBe(0);
  });

  it('excludes self-logged consumptions', async () => {
    const { club, userB, memberB, session, beer } = await seedClubWithTwoMembers();
    // Self-log: memberB logs for themselves (created_by_user_id == B's user)
    await logOnBehalf({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userB.id,
    });
    const result = await onBehalfReviewSummaryForMember(memberB.id, club.id);
    expect(result.count).toBe(0);
  });

  it('scopes by club_id (no cross-club leakage)', async () => {
    const a = await seedClubWithTwoMembers('Club A');
    await logOnBehalf({
      clubId: a.club.id,
      sessionId: a.session.id,
      memberId: a.memberB.id,
      beerId: a.beer.id,
      loggerUserId: a.userA.id,
    });
    const b = await seedClubWithTwoMembers('Club B');
    // Ask for A.memberB scoped to B's club — should return nothing.
    const result = await onBehalfReviewSummaryForMember(a.memberB.id, b.club.id);
    expect(result.count).toBe(0);
  });
});
