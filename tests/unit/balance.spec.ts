import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { effectiveConsumptionTotal, memberBalance } from '@/lib/balance/calculate';

// Seed helpers — minimal rows to make foreign keys happy.
async function seed(db: TestDb) {
  const [user] = await db
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: 'a@example.com', name: 'A' })
    .returning();
  if (!user) throw new Error('seed user');
  const [club] = await db
    .insert((await import('@/lib/db/schema/clubs')).clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  const [member] = await db
    .insert((await import('@/lib/db/schema/members')).members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: user.name,
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');
  const [beer] = await db
    .insert((await import('@/lib/db/schema/catalog')).beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: user.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');
  const [session] = await db
    .insert((await import('@/lib/db/schema/sessions')).drinkSessions)
    .values({
      clubId: club.id,
      openedByUserId: user.id,
      startedAt: new Date(),
    })
    .returning();
  if (!session) throw new Error('seed session');
  return { user, club, member, beer, session };
}

async function logConsumption(
  db: TestDb,
  args: { clubId: string; sessionId: string; memberId: string; beerId: string; userId: string },
) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await db
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.sessionId,
      memberId: args.memberId,
      beerTypeId: args.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: args.userId,
    })
    .returning();
  if (!c) throw new Error('insert consumption');
  return c;
}

async function voidConsumption(db: TestDb, args: { clubId: string; consumptionId: string; userId: string }) {
  const { consumptionVoids } = await import('@/lib/db/schema/consumption');
  await db.insert(consumptionVoids).values({
    clubId: args.clubId,
    consumptionId: args.consumptionId,
    voidedByUserId: args.userId,
  });
}

describe('balance calculator', () => {
  beforeEach(async () => {
    const { db } = await makeTestDb();
    testDb = db;
  });

  it('returns 0 for a member with no consumptions', async () => {
    const { member } = await seed(testDb);
    const total = await effectiveConsumptionTotal(member.id);
    expect(total).toBe(0n);
    expect(await memberBalance(member.id)).toBe(0n);
  });

  it('sums unvoided consumptions correctly', async () => {
    const { user, club, member, beer, session } = await seed(testDb);
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    expect(await effectiveConsumptionTotal(member.id)).toBe(10_000n);
  });

  it('excludes voided consumptions from the total', async () => {
    const { user, club, member, beer, session } = await seed(testDb);
    const c1 = await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    await voidConsumption(testDb, { clubId: club.id, consumptionId: c1.id, userId: user.id });
    expect(await effectiveConsumptionTotal(member.id)).toBe(5_000n);
  });

  it('scopes effectiveConsumptionTotal to a specific session', async () => {
    const { user, club, member, beer, session } = await seed(testDb);
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const [other] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: user.id,
        startedAt: new Date(),
        endedAt: new Date(),
      })
      .returning();
    if (!other) throw new Error('seed other session');

    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: other.id,
      memberId: member.id,
      beerId: beer.id,
      userId: user.id,
    });
    expect(await effectiveConsumptionTotal(member.id, session.id)).toBe(5_000n);
    expect(await effectiveConsumptionTotal(member.id, other.id)).toBe(5_000n);
    expect(await effectiveConsumptionTotal(member.id)).toBe(10_000n);
  });
});
