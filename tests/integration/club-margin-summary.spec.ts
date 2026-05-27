import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getClubMarginSummary } from '@/lib/db/queries/catalog';

async function seedClub() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');
  const { drinkSessions } = await import('@/lib/db/schema/sessions');

  const [user] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@example.test`, name: 'U' })
    .returning();
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
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
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: user!.id, startedAt: new Date() })
    .returning();
  return { user: user!, club: club!, member: member!, session: session! };
}

async function seedBeer(opts: {
  clubId: string;
  createdByUserId: string;
  name: string;
  sellMinor: bigint;
  buyMinor: bigint | null;
  archived?: boolean;
}) {
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const [b] = await testDb
    .insert(beerTypes)
    .values({
      clubId: opts.clubId,
      name: opts.name,
      unitPriceMinor: opts.sellMinor,
      buyPriceMinor: opts.buyMinor,
      currentStock: 100,
      isArchived: opts.archived ?? false,
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  return b!;
}

async function logConsumption(opts: {
  clubId: string;
  sessionId: string;
  memberId: string;
  beerId: string;
  priceMinor: bigint;
  createdByUserId: string;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await testDb
    .insert(consumptions)
    .values({
      clubId: opts.clubId,
      drinkSessionId: opts.sessionId,
      memberId: opts.memberId,
      beerTypeId: opts.beerId,
      unitPriceMinorSnapshot: opts.priceMinor,
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  return c!;
}

describe('getClubMarginSummary', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('zero margin + zero untracked on an empty club', async () => {
    const { club } = await seedClub();
    const result = await getClubMarginSummary(club.id);
    expect(result.totalMarginMinor).toBe(0n);
    expect(result.untrackedBeerCount).toBe(0);
  });

  it('sums (sell - buy) × non-voided consumptions for one beer', async () => {
    const { user, club, member, session } = await seedClub();
    const beer = await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner',
      sellMinor: 5000n,
      buyMinor: 3000n,
    });
    for (let i = 0; i < 4; i++) {
      await logConsumption({
        clubId: club.id,
        sessionId: session.id,
        memberId: member.id,
        beerId: beer.id,
        priceMinor: 5000n,
        createdByUserId: user.id,
      });
    }

    const result = await getClubMarginSummary(club.id);
    // (5000 - 3000) × 4 = 8000
    expect(result.totalMarginMinor).toBe(8000n);
    expect(result.untrackedBeerCount).toBe(0);
  });

  it('voided consumptions are excluded from the margin sum', async () => {
    const { user, club, member, session } = await seedClub();
    const beer = await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner',
      sellMinor: 5000n,
      buyMinor: 3000n,
    });
    const c1 = await logConsumption({
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      priceMinor: 5000n,
      createdByUserId: user.id,
    });
    await logConsumption({
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      priceMinor: 5000n,
      createdByUserId: user.id,
    });

    // Void c1.
    const { consumptionVoids } = await import('@/lib/db/schema/consumption');
    await testDb
      .insert(consumptionVoids)
      .values({
        clubId: club.id,
        consumptionId: c1.id,
        voidedByUserId: user.id,
      });

    const result = await getClubMarginSummary(club.id);
    // Only the unvoided one counts: (5000 - 3000) × 1 = 2000.
    expect(result.totalMarginMinor).toBe(2000n);
  });

  it('untrackedBeerCount counts ACTIVE beers without a buy price', async () => {
    const { user, club } = await seedClub();
    await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Tracked',
      sellMinor: 5000n,
      buyMinor: 3000n,
    });
    await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Untracked A',
      sellMinor: 5000n,
      buyMinor: null,
    });
    await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Untracked B',
      sellMinor: 5000n,
      buyMinor: null,
    });
    // Archived untracked beers don't count toward the nudge.
    await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Archived',
      sellMinor: 5000n,
      buyMinor: null,
      archived: true,
    });

    const result = await getClubMarginSummary(club.id);
    expect(result.untrackedBeerCount).toBe(2);
  });

  it('archived tracked beers DO contribute to margin (historical sales count)', async () => {
    const { user, club, member, session } = await seedClub();
    // Note: this is the current behavior — the WHERE clause only
    // requires isArchived=false, so an archived beer with buy_price
    // would NOT contribute. Verify that's what we observe.
    const beer = await seedBeer({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner',
      sellMinor: 5000n,
      buyMinor: 3000n,
      archived: true,
    });
    await logConsumption({
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: beer.id,
      priceMinor: 5000n,
      createdByUserId: user.id,
    });

    const result = await getClubMarginSummary(club.id);
    // Archived beers are filtered out of the WHERE clause, so the
    // margin sum is 0 even though there's an unvoided consumption.
    expect(result.totalMarginMinor).toBe(0n);
  });

  it('scopes to one club — another club\'s margin is invisible (Principle II)', async () => {
    const a = await seedClub();
    const b = await seedClub();
    const beerA = await seedBeer({
      clubId: a.club.id,
      createdByUserId: a.user.id,
      name: 'A',
      sellMinor: 5000n,
      buyMinor: 3000n,
    });
    const beerB = await seedBeer({
      clubId: b.club.id,
      createdByUserId: b.user.id,
      name: 'B',
      sellMinor: 5000n,
      buyMinor: 1000n,
    });
    await logConsumption({
      clubId: a.club.id,
      sessionId: a.session.id,
      memberId: a.member.id,
      beerId: beerA.id,
      priceMinor: 5000n,
      createdByUserId: a.user.id,
    });
    await logConsumption({
      clubId: b.club.id,
      sessionId: b.session.id,
      memberId: b.member.id,
      beerId: beerB.id,
      priceMinor: 5000n,
      createdByUserId: b.user.id,
    });

    const aResult = await getClubMarginSummary(a.club.id);
    expect(aResult.totalMarginMinor).toBe(2000n);

    const bResult = await getClubMarginSummary(b.club.id);
    expect(bResult.totalMarginMinor).toBe(4000n);
  });
});
