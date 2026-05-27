import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getAllMemberBalances } from '@/lib/db/queries/payments';

async function seedClub() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { drinkSessions } = await import('@/lib/db/schema/sessions');

  const [user] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@example.test`, name: 'U' })
    .returning();
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: user!.id, startedAt: new Date() })
    .returning();
  return { user: user!, club: club!, session: session! };
}

async function seedMember(opts: {
  clubId: string;
  name: string;
  isActive?: boolean;
}) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');
  const [user] = await testDb
    .insert(users)
    .values({
      email: `${opts.name}-${Date.now()}-${Math.random()}@example.test`,
      name: opts.name,
    })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: opts.clubId,
      userId: user!.id,
      email: user!.email,
      displayName: opts.name,
      role: 'member',
      isActive: opts.isActive ?? true,
    })
    .returning();
  return { user: user!, member: member! };
}

async function seedBeer(clubId: string, createdByUserId: string) {
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const [b] = await testDb
    .insert(beerTypes)
    .values({
      clubId,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 1000,
      createdByUserId,
    })
    .returning();
  return b!;
}

async function consume(opts: {
  clubId: string;
  sessionId: string;
  memberId: string;
  beerId: string;
  createdByUserId: string;
  count: number;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  for (let i = 0; i < opts.count; i++) {
    await testDb.insert(consumptions).values({
      clubId: opts.clubId,
      drinkSessionId: opts.sessionId,
      memberId: opts.memberId,
      beerTypeId: opts.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: opts.createdByUserId,
    });
  }
}

async function pay(opts: {
  clubId: string;
  memberId: string;
  amount: bigint;
  status: 'claimed' | 'confirmed' | 'disputed' | 'voided';
  createdByUserId: string;
}) {
  const { payments } = await import('@/lib/db/schema/payments');
  await testDb.insert(payments).values({
    clubId: opts.clubId,
    memberId: opts.memberId,
    amountMinor: opts.amount,
    currencyCode: 'CZK',
    status: opts.status,
    origin: 'member_initiated',
    createdByUserId: opts.createdByUserId,
  });
}

describe('getAllMemberBalances', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns one row per club member, sorted by balance descending', async () => {
    const { user, club, session } = await seedClub();
    const beer = await seedBeer(club.id, user.id);
    const alice = await seedMember({ clubId: club.id, name: 'alice' });
    const bob = await seedMember({ clubId: club.id, name: 'bob' });
    const carol = await seedMember({ clubId: club.id, name: 'carol' });

    // alice: 3 beers = 15000 debt, no payments → balance 15000
    // bob:   1 beer  = 5000 debt,  no payments → balance 5000
    // carol: 0 beers = 0 → balance 0
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: alice.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 3,
    });
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: bob.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 1,
    });

    const rows = await getAllMemberBalances(club.id);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.displayName)).toEqual(['alice', 'bob', 'carol']);
    expect(rows[0]!.balanceMinor).toBe(15000n);
    expect(rows[1]!.balanceMinor).toBe(5000n);
    expect(rows[2]!.balanceMinor).toBe(0n);
  });

  it('confirmed payments reduce the balance; claimed payments do NOT', async () => {
    const { user, club, session } = await seedClub();
    const beer = await seedBeer(club.id, user.id);
    const alice = await seedMember({ clubId: club.id, name: 'alice' });
    // 4 beers = 20000 debt.
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: alice.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 4,
    });
    // 5000 confirmed (counts) + 3000 claimed (does not count toward balance,
    // but populates pendingConfirmationMinor).
    await pay({
      clubId: club.id,
      memberId: alice.member.id,
      amount: 5000n,
      status: 'confirmed',
      createdByUserId: alice.user.id,
    });
    await pay({
      clubId: club.id,
      memberId: alice.member.id,
      amount: 3000n,
      status: 'claimed',
      createdByUserId: alice.user.id,
    });

    const rows = await getAllMemberBalances(club.id);
    const a = rows.find((r) => r.displayName === 'alice')!;
    expect(a.balanceMinor).toBe(15000n);
    expect(a.pendingConfirmationMinor).toBe(3000n);
  });

  it('disputed and voided payments do NOT touch the balance', async () => {
    const { user, club, session } = await seedClub();
    const beer = await seedBeer(club.id, user.id);
    const alice = await seedMember({ clubId: club.id, name: 'alice' });
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: alice.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 2,
    });
    // Various non-contributing statuses.
    await pay({
      clubId: club.id,
      memberId: alice.member.id,
      amount: 10000n,
      status: 'disputed',
      createdByUserId: alice.user.id,
    });
    await pay({
      clubId: club.id,
      memberId: alice.member.id,
      amount: 10000n,
      status: 'voided',
      createdByUserId: alice.user.id,
    });

    const rows = await getAllMemberBalances(club.id);
    expect(rows[0]!.balanceMinor).toBe(10000n);
    expect(rows[0]!.pendingConfirmationMinor).toBe(0n);
  });

  it('voided consumptions are excluded from the debt', async () => {
    const { user, club, session } = await seedClub();
    const beer = await seedBeer(club.id, user.id);
    const alice = await seedMember({ clubId: club.id, name: 'alice' });
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: alice.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 2,
    });
    // Void one of the two consumptions.
    const { consumptions, consumptionVoids } = await import('@/lib/db/schema/consumption');
    const { eq } = await import('drizzle-orm');
    const allCons = await testDb
      .select()
      .from(consumptions)
      .where(eq(consumptions.memberId, alice.member.id));
    await testDb.insert(consumptionVoids).values({
      clubId: club.id,
      consumptionId: allCons[0]!.id,
      voidedByUserId: user.id,
    });

    const rows = await getAllMemberBalances(club.id);
    expect(rows[0]!.balanceMinor).toBe(5000n);
  });

  it('inactive members still appear with their balance preserved', async () => {
    const { user, club, session } = await seedClub();
    const beer = await seedBeer(club.id, user.id);
    const ghost = await seedMember({ clubId: club.id, name: 'ghost', isActive: false });
    await consume({
      clubId: club.id,
      sessionId: session.id,
      memberId: ghost.member.id,
      beerId: beer.id,
      createdByUserId: user.id,
      count: 1,
    });

    const rows = await getAllMemberBalances(club.id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.isActive).toBe(false);
    expect(rows[0]!.balanceMinor).toBe(5000n);
  });

  it('club scoping — other-club members and payments are invisible', async () => {
    const a = await seedClub();
    const b = await seedClub();
    const beerA = await seedBeer(a.club.id, a.user.id);
    const beerB = await seedBeer(b.club.id, b.user.id);
    const aliceA = await seedMember({ clubId: a.club.id, name: 'alice-a' });
    const aliceB = await seedMember({ clubId: b.club.id, name: 'alice-b' });
    await consume({
      clubId: a.club.id,
      sessionId: a.session.id,
      memberId: aliceA.member.id,
      beerId: beerA.id,
      createdByUserId: a.user.id,
      count: 1,
    });
    await consume({
      clubId: b.club.id,
      sessionId: b.session.id,
      memberId: aliceB.member.id,
      beerId: beerB.id,
      createdByUserId: b.user.id,
      count: 5,
    });

    const aRows = await getAllMemberBalances(a.club.id);
    expect(aRows.length).toBe(1);
    expect(aRows[0]!.displayName).toBe('alice-a');
    expect(aRows[0]!.balanceMinor).toBe(5000n);

    const bRows = await getAllMemberBalances(b.club.id);
    expect(bRows.length).toBe(1);
    expect(bRows[0]!.displayName).toBe('alice-b');
    expect(bRows[0]!.balanceMinor).toBe(25000n);
  });
});
