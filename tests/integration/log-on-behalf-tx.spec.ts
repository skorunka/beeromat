import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

// Stub the auth ctx + Next runtime hooks per-test.
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
vi.mock('@/lib/balance/calculate', () => ({
  memberBalance: async () => 0n,
}));

import { logBeerOnBehalfAction } from '@/app/[locale]/(app)/log/actions';

// Spec 019 T008 — integration coverage for logBeerOnBehalfAction.

async function seedClubWithTwoMembersAndBeer(opts: { stock?: number } = {}) {
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

  const [beer] = await testDb
    .insert((await import('@/lib/db/schema/catalog')).beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: opts.stock ?? 100,
      createdByUserId: userA.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');

  return { club, userA, userB, memberA, memberB, beer };
}

describe('logBeerOnBehalfAction (spec 019)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — creates consumption with member_id=target, created_by_user_id=actor + decrements stock', async () => {
    const { club, userA, memberA, memberB, beer } = await seedClubWithTwoMembersAndBeer();
    // Alice logs for Bob.
    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await logBeerOnBehalfAction({
      beerTypeId: beer.id,
      targetMemberId: memberB.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.targetMemberId).toBe(memberB.id);

    const { consumptions } = await import('@/lib/db/schema/consumption');
    const rows = await testDb.select().from(consumptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.memberId).toBe(memberB.id);
    expect(rows[0]?.createdByUserId).toBe(userA.id);

    // Stock decremented.
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const [b] = await testDb.select().from(beerTypes).where(eq(beerTypes.id, beer.id));
    expect(b?.currentStock).toBe(99);
  });

  it('rejects TARGET_IS_SELF when the actor picks themselves', async () => {
    const { club, userA, memberA, beer } = await seedClubWithTwoMembersAndBeer();
    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await logBeerOnBehalfAction({
      beerTypeId: beer.id,
      targetMemberId: memberA.id, // self
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('TARGET_IS_SELF');
  });

  it('rejects TARGET_NOT_IN_CLUB when target is from another club', async () => {
    const { club: clubA, userA, memberA, beer } = await seedClubWithTwoMembersAndBeer();
    // Make an unrelated member in a different club.
    const [otherUser] = await testDb
      .insert((await import('@/lib/db/schema/auth')).users)
      .values({ email: `other-${Date.now()}@example.test`, name: 'Other' })
      .returning();
    if (!otherUser) throw new Error('other user');
    const [otherClub] = await testDb
      .insert((await import('@/lib/db/schema/clubs')).clubs)
      .values({ name: 'Other Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!otherClub) throw new Error('other club');
    const [otherMember] = await testDb
      .insert((await import('@/lib/db/schema/members')).members)
      .values({
        clubId: otherClub.id,
        userId: otherUser.id,
        email: otherUser.email,
        displayName: 'Other',
        role: 'member',
      })
      .returning();
    if (!otherMember) throw new Error('other member');

    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: clubA.id },
    };
    const result = await logBeerOnBehalfAction({
      beerTypeId: beer.id,
      targetMemberId: otherMember.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('TARGET_NOT_IN_CLUB');
  });

  it('rejects OUT_OF_STOCK when the beer is at zero', async () => {
    const { club, userA, memberA, memberB, beer } = await seedClubWithTwoMembersAndBeer({
      stock: 0,
    });
    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await logBeerOnBehalfAction({
      beerTypeId: beer.id,
      targetMemberId: memberB.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('OUT_OF_STOCK');
  });

  it('auto-opens a drink session when none exists', async () => {
    const { club, userA, memberA, memberB, beer } = await seedClubWithTwoMembersAndBeer();
    // Explicitly NO session pre-seeded.
    ctxRef.current = {
      user: { id: userA.id },
      member: { id: memberA.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await logBeerOnBehalfAction({
      beerTypeId: beer.id,
      targetMemberId: memberB.id,
    });
    expect(result.ok).toBe(true);

    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const sessions = await testDb.select().from(drinkSessions);
    expect(sessions).toHaveLength(1);
  });
});
