import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 038 — reconcile awards the right tier keys cumulatively, and tiers stay
// sticky when the stat later drops. (Base reconcile behaviour is covered by
// reconcile-achievements.spec — here only the NEW tier behaviour.)

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { reconcileAchievements, getEarnedBadges } from '@/lib/db/queries/achievements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';

async function setup() {
  const [club] = await testDb.insert(clubs).values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
  const [u] = await testDb.insert(users).values({ email: `a-${Math.random()}@x.test`, name: 'Adam', emailVerified: true }).returning();
  const [m] = await testDb
    .insert(members)
    .values({ clubId: club!.id, userId: u!.id, email: u!.email, displayName: 'Adam', role: 'member', acceptedInvitationAt: new Date() })
    .returning();
  const [beer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club!.id, name: 'Pilsner', unitPriceMinor: 40n, currentStock: 10000, createdByUserId: u!.id })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: u!.id, startedAt: new Date() })
    .returning();
  return { clubId: club!.id, memberId: m!.id, userId: u!.id, beerId: beer!.id, sessionId: session!.id };
}

async function addBeers(ctx: Awaited<ReturnType<typeof setup>>, n: number): Promise<string[]> {
  const rows = await testDb
    .insert(consumptions)
    .values(
      Array.from({ length: n }, () => ({
        clubId: ctx.clubId,
        drinkSessionId: ctx.sessionId,
        memberId: ctx.memberId,
        beerTypeId: ctx.beerId,
        unitPriceMinorSnapshot: 40n,
        createdByUserId: ctx.userId,
      })),
    )
    .returning({ id: consumptions.id });
  return rows.map((r) => r.id);
}

describe('reconcile tiers (spec 038)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('awards bronze + silver at 250 (not gold); gold at 500', async () => {
    const ctx = await setup();
    await addBeers(ctx, 250);
    const earned1 = await reconcileAchievements({ clubId: ctx.clubId, memberId: ctx.memberId });
    expect(earned1).toContain('centuryClub'); // bronze (100)
    expect(earned1).toContain('centuryClubSilver'); // silver (250)
    expect(earned1).not.toContain('centuryClubGold'); // gold (500) not yet

    await addBeers(ctx, 250); // → 500
    const earned2 = await reconcileAchievements({ clubId: ctx.clubId, memberId: ctx.memberId });
    expect(earned2).toEqual(['centuryClubGold']); // only the newly-crossed tier
  });

  it('is sticky — voiding back under silver keeps the silver tier', async () => {
    const ctx = await setup();
    const ids = await addBeers(ctx, 250);
    await reconcileAchievements({ clubId: ctx.clubId, memberId: ctx.memberId });

    // Void 5 beers → 245 (below the 250 silver threshold).
    await testDb.insert(consumptionVoids).values(
      ids.slice(0, 5).map((consumptionId) => ({ clubId: ctx.clubId, consumptionId, voidedByUserId: ctx.userId })),
    );

    const after = await reconcileAchievements({ clubId: ctx.clubId, memberId: ctx.memberId });
    expect(after).toEqual([]); // nothing new, and...
    const held = (await getEarnedBadges({ clubId: ctx.clubId, memberId: ctx.memberId })).map((e) => e.key);
    expect(held).toContain('centuryClubSilver'); // ...silver NOT revoked (sticky)
  });
});
