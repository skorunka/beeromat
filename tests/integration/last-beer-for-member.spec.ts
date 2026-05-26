import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { lastBeerForMember } from '@/lib/db/queries/consumption';

// Spec 017 T002 — integration coverage for the predictive-default
// lookup powering home's one-tap log button.

async function seed(db: TestDb, opts: { clubName?: string } = {}) {
  const [user] = await db
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `u${Date.now()}-${Math.random()}@example.test`, name: 'U' })
    .returning();
  if (!user) throw new Error('seed user');
  const [club] = await db
    .insert((await import('@/lib/db/schema/clubs')).clubs)
    .values({
      name: opts.clubName ?? 'Test Club',
      currencyCode: 'CZK',
      defaultLocale: 'cs-CZ',
    })
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
  const [session] = await db
    .insert((await import('@/lib/db/schema/sessions')).drinkSessions)
    .values({ clubId: club.id, openedByUserId: user.id, startedAt: new Date() })
    .returning();
  if (!session) throw new Error('seed session');
  return { user, club, member, session };
}

async function seedBeer(
  db: TestDb,
  args: {
    clubId: string;
    userId: string;
    name: string;
    currentStock?: number;
    isArchived?: boolean;
    unitPriceMinor?: bigint;
  },
) {
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const [b] = await db
    .insert(beerTypes)
    .values({
      clubId: args.clubId,
      name: args.name,
      currentStock: args.currentStock ?? 100,
      isArchived: args.isArchived ?? false,
      unitPriceMinor: args.unitPriceMinor ?? 5000n,
      createdByUserId: args.userId,
    })
    .returning();
  if (!b) throw new Error('seed beer');
  return b;
}

async function logConsumption(
  db: TestDb,
  args: {
    clubId: string;
    sessionId: string;
    memberId: string;
    beerId: string;
    userId: string;
    createdAt?: Date;
  },
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
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    })
    .returning();
  if (!c) throw new Error('insert consumption');
  return c;
}

async function voidConsumption(
  db: TestDb,
  args: { clubId: string; consumptionId: string; userId: string },
) {
  const { consumptionVoids } = await import('@/lib/db/schema/consumption');
  await db.insert(consumptionVoids).values({
    clubId: args.clubId,
    consumptionId: args.consumptionId,
    voidedByUserId: args.userId,
  });
}

describe('lastBeerForMember — spec 017 predictive-default lookup', () => {
  beforeEach(async () => {
    const { db } = await makeTestDb();
    testDb = db;
  });

  it('returns null when the member has no consumptions', async () => {
    const { member, club } = await seed(testDb);
    const result = await lastBeerForMember(member.id, club.id);
    expect(result).toBeNull();
  });

  it('returns the most recent consumption’s beer with stock + archived flags', async () => {
    const { user, club, member, session } = await seed(testDb);
    const pilsner = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Pilsner',
      currentStock: 42,
      isArchived: false,
      unitPriceMinor: 5000n,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: pilsner.id,
      userId: user.id,
    });

    const result = await lastBeerForMember(member.id, club.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(pilsner.id);
    expect(result?.name).toBe('Pilsner');
    expect(result?.currentStock).toBe(42);
    expect(result?.isArchived).toBe(false);
    expect(result?.unitPriceMinor).toBe(5000n);
  });

  it('returns the newest non-voided beer when multiple consumptions exist', async () => {
    const { user, club, member, session } = await seed(testDb);
    const pilsner = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Pilsner',
    });
    const kozel = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Kozel',
    });

    // Older consumption: Pilsner. Newer consumption: Kozel.
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: pilsner.id,
      userId: user.id,
      createdAt: new Date(Date.now() - 60_000),
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: kozel.id,
      userId: user.id,
    });

    const result = await lastBeerForMember(member.id, club.id);
    expect(result?.name).toBe('Kozel');
  });

  it('ignores voided consumptions even when they are the most recent', async () => {
    const { user, club, member, session } = await seed(testDb);
    const pilsner = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Pilsner',
    });
    const kozel = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Kozel',
    });

    // Older Pilsner stays valid.
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: pilsner.id,
      userId: user.id,
      createdAt: new Date(Date.now() - 60_000),
    });
    // Newer Kozel gets voided.
    const voidedKozel = await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: kozel.id,
      userId: user.id,
    });
    await voidConsumption(testDb, {
      clubId: club.id,
      consumptionId: voidedKozel.id,
      userId: user.id,
    });

    const result = await lastBeerForMember(member.id, club.id);
    expect(result?.name).toBe('Pilsner');
  });

  it('scopes results to the active club — no cross-club leakage', async () => {
    // Club A — member logs Pilsner.
    const a = await seed(testDb, { clubName: 'Club A' });
    const pilsner = await seedBeer(testDb, {
      clubId: a.club.id,
      userId: a.user.id,
      name: 'Pilsner',
    });
    await logConsumption(testDb, {
      clubId: a.club.id,
      sessionId: a.session.id,
      memberId: a.member.id,
      beerId: pilsner.id,
      userId: a.user.id,
    });

    // Club B — different club, different member. We ask for A.member
    // against B.club — should return null (member.id matches but the
    // club_id filter excludes the consumption).
    const b = await seed(testDb, { clubName: 'Club B' });

    const result = await lastBeerForMember(a.member.id, b.club.id);
    expect(result).toBeNull();
  });

  it('returns archived beer metadata so the caller can pick the fallback variant', async () => {
    const { user, club, member, session } = await seed(testDb);
    const archived = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Old IPA',
      isArchived: true,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: archived.id,
      userId: user.id,
    });

    const result = await lastBeerForMember(member.id, club.id);
    expect(result?.isArchived).toBe(true);
    expect(result?.name).toBe('Old IPA');
  });

  it('returns out-of-stock beer metadata so the caller can render the disabled variant', async () => {
    const { user, club, member, session } = await seed(testDb);
    const empty = await seedBeer(testDb, {
      clubId: club.id,
      userId: user.id,
      name: 'Pilsner',
      currentStock: 0,
    });
    await logConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      memberId: member.id,
      beerId: empty.id,
      userId: user.id,
    });

    const result = await lastBeerForMember(member.id, club.id);
    expect(result?.currentStock).toBe(0);
    expect(result?.isArchived).toBe(false);
  });
});
