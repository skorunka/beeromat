import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getSessionHistory } from '@/lib/db/queries/consumption';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';

async function seedMember(label: string, clubId: string) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({
      email: `${label}-${Date.now()}-${Math.random()}@example.test`,
      name: label,
    })
    .returning();
  if (!user) throw new Error('seed user');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: user.id,
      email: user.email,
      displayName: label,
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, member };
}

describe('getSessionHistory — spec 027 batched aggregation', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns the same per-session totals as effectiveConsumptionTotal (semantics preserved)', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const { consumptions, consumptionVoids } = await import(
      '@/lib/db/schema/consumption'
    );
    const { betTransfers } = await import('@/lib/db/schema/bets');

    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const { user: u1, member: alice } = await seedMember('alice', club.id);
    const { user: u2, member: bob } = await seedMember('bob', club.id);

    const [pilsner] = await testDb
      .insert(beerTypes)
      .values({
        clubId: club.id,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: u1.id,
      })
      .returning();
    if (!pilsner) throw new Error('seed beer');

    // Three sessions with varied scenarios.
    const [s1] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: u1.id,
        startedAt: new Date('2026-04-01T18:00:00Z'),
        endedAt: new Date('2026-04-01T20:00:00Z'),
      })
      .returning();
    const [s2] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: u1.id,
        startedAt: new Date('2026-04-08T18:00:00Z'),
        endedAt: new Date('2026-04-08T20:00:00Z'),
      })
      .returning();
    const [s3] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: u1.id,
        startedAt: new Date('2026-04-15T18:00:00Z'),
        endedAt: new Date('2026-04-15T20:00:00Z'),
      })
      .returning();
    if (!s1 || !s2 || !s3) throw new Error('seed sessions');

    // Session 1: alice logs 2 beers — own total = 10000.
    await testDb.insert(consumptions).values([
      {
        clubId: club.id,
        drinkSessionId: s1.id,
        memberId: alice.id,
        beerTypeId: pilsner.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u1.id,
      },
      {
        clubId: club.id,
        drinkSessionId: s1.id,
        memberId: alice.id,
        beerTypeId: pilsner.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u1.id,
      },
    ]);

    // Session 2: alice logs 1, bob logs 1, bob transfers his to alice.
    // After transfer: alice owes 10000 (own 5000 + transferred-in 5000).
    const [aliceCons2] = await testDb
      .insert(consumptions)
      .values({
        clubId: club.id,
        drinkSessionId: s2.id,
        memberId: alice.id,
        beerTypeId: pilsner.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u1.id,
      })
      .returning();
    const [bobCons2] = await testDb
      .insert(consumptions)
      .values({
        clubId: club.id,
        drinkSessionId: s2.id,
        memberId: bob.id,
        beerTypeId: pilsner.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u2.id,
      })
      .returning();
    if (!aliceCons2 || !bobCons2) throw new Error('seed s2');
    await testDb.insert(betTransfers).values({
      clubId: club.id,
      sourceConsumptionId: bobCons2.id,
      fromMemberId: bob.id,
      toMemberId: alice.id,
      createdByUserId: u1.id,
    });

    // Session 3: alice logs 1, then it's voided. Own total = 0.
    const [aliceCons3] = await testDb
      .insert(consumptions)
      .values({
        clubId: club.id,
        drinkSessionId: s3.id,
        memberId: alice.id,
        beerTypeId: pilsner.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u1.id,
      })
      .returning();
    if (!aliceCons3) throw new Error('seed s3');
    await testDb.insert(consumptionVoids).values({
      clubId: club.id,
      consumptionId: aliceCons3.id,
      voidedByUserId: u1.id,
    });

    // Call the new batched implementation.
    const history = await getSessionHistory({
      clubId: club.id,
      memberId: alice.id,
    });
    expect(history).toHaveLength(3);
    const bySessionId = new Map(history.map((h) => [h.id, h]));

    // Compare against the canonical per-session implementation.
    for (const sessionId of [s1.id, s2.id, s3.id]) {
      const expected = await effectiveConsumptionTotal(alice.id, sessionId);
      expect(bySessionId.get(sessionId)?.myTotalMinor).toBe(expected);
    }
  });

  it('returns empty array when the member has no sessions (no extra queries)', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Empty', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');
    const { member } = await seedMember('lonely', club.id);

    const history = await getSessionHistory({
      clubId: club.id,
      memberId: member.id,
    });
    expect(history).toEqual([]);
  });
});
