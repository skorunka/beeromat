import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 035 — reconcileAchievements / getEarnedBadges / reconcileAllClubMembers:
// insert-if-absent, idempotent, STICKY (never revoked), multi-earn, backfill stamp.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import {
  reconcileAchievements,
  getEarnedBadges,
  reconcileAllClubMembers,
} from '@/lib/db/queries/achievements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';

async function mkMember(clubId: string, name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: u!.id,
      email: u!.email,
      displayName: name,
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  return { userId: u!.id, memberId: m!.id };
}

async function setup() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const a = await mkMember(club!.id, 'Adam');
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: a.userId, startedAt: new Date() })
    .returning();
  return { clubId: club!.id, session: session!, a };
}

/** Insert `count` beers for `memberId` spread across `typeCount` distinct beer types. */
async function seedBeers(
  clubId: string,
  sessionId: string,
  memberId: string,
  createdByUserId: string,
  count: number,
  typeCount: number,
): Promise<string[]> {
  const typeIds: string[] = [];
  for (let i = 0; i < typeCount; i++) {
    const [bt] = await testDb
      .insert(beerTypes)
      .values({
        clubId,
        name: `Beer ${i}-${Math.random()}`,
        unitPriceMinor: 40n,
        currentStock: 1000,
        createdByUserId,
      })
      .returning();
    typeIds.push(bt!.id);
  }
  const values = Array.from({ length: count }, (_, i) => ({
    clubId,
    drinkSessionId: sessionId,
    memberId,
    beerTypeId: typeIds[i % typeCount]!,
    unitPriceMinorSnapshot: 40n,
    createdByUserId,
  }));
  const rows = await testDb.insert(consumptions).values(values).returning({ id: consumptions.id });
  return rows.map((r) => r.id);
}

describe('reconcileAchievements (spec 035)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('awards a qualifying badge, is idempotent, and getEarnedBadges reflects it', async () => {
    const { clubId, session, a } = await setup();
    await seedBeers(clubId, session.id, a.memberId, a.userId, 100, 1); // 100 beers, 1 type

    const first = await reconcileAchievements({ clubId, memberId: a.memberId });
    expect(first).toContain('centuryClub');
    expect(first).not.toContain('connoisseur'); // only 1 distinct type

    const earned = await getEarnedBadges({ clubId, memberId: a.memberId });
    expect(earned.map((e) => e.key)).toContain('centuryClub');
    expect(earned[0]!.earnedAt).toBeInstanceOf(Date);

    // Idempotent: a second reconcile awards nothing new, no duplicate row.
    const second = await reconcileAchievements({ clubId, memberId: a.memberId });
    expect(second).toEqual([]);
    const earnedAgain = await getEarnedBadges({ clubId, memberId: a.memberId });
    expect(earnedAgain.filter((e) => e.key === 'centuryClub')).toHaveLength(1);
  });

  it('is STICKY — voiding a beer below the threshold never revokes the badge', async () => {
    const { clubId, session, a } = await setup();
    const ids = await seedBeers(clubId, session.id, a.memberId, a.userId, 100, 1);

    await reconcileAchievements({ clubId, memberId: a.memberId });

    // Void one consumption → member now has 99 (below 100).
    await testDb
      .insert(consumptionVoids)
      .values({ clubId, consumptionId: ids[0]!, voidedByUserId: a.userId });

    // A re-reconcile awards nothing new and, crucially, does NOT remove the badge.
    const after = await reconcileAchievements({ clubId, memberId: a.memberId });
    expect(after).toEqual([]);
    const earned = await getEarnedBadges({ clubId, memberId: a.memberId });
    expect(earned.map((e) => e.key)).toContain('centuryClub');
  });

  it('records multiple badges earned from one reconcile', async () => {
    const { clubId, session, a } = await setup();
    await seedBeers(clubId, session.id, a.memberId, a.userId, 100, 5); // 100 beers across 5 types

    const earnedKeys = await reconcileAchievements({ clubId, memberId: a.memberId });
    expect(earnedKeys).toContain('centuryClub');
    expect(earnedKeys).toContain('connoisseur');
    const stored = await getEarnedBadges({ clubId, memberId: a.memberId });
    expect(stored.map((e) => e.key).sort()).toEqual(['centuryClub', 'connoisseur']);
  });

  it('reconcileAllClubMembers stamps earned_at with the passed date and is re-run safe', async () => {
    const { clubId, session, a } = await setup();
    await seedBeers(clubId, session.id, a.memberId, a.userId, 100, 1);

    const stamp = new Date('2020-01-01T00:00:00.000Z');
    const inserted = await reconcileAllClubMembers({ clubId, stampAt: stamp });
    expect(inserted).toBeGreaterThanOrEqual(1);

    const earned = await getEarnedBadges({ clubId, memberId: a.memberId });
    const century = earned.find((e) => e.key === 'centuryClub');
    expect(century).toBeDefined();
    expect(century!.earnedAt.toISOString()).toBe(stamp.toISOString());

    // Re-run inserts nothing more (insert-if-absent).
    const again = await reconcileAllClubMembers({ clubId, stampAt: new Date() });
    expect(again).toBe(0);
  });
});
