import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 034 — getLeaderboards: correct ranking, voided excluded, win-rate
// guard, club scoping, viewer row.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getLeaderboards } from '@/lib/db/queries/leaderboards';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matches } from '@/lib/db/schema/matches';

async function mkMember(clubId: string, name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({ clubId, userId: u!.id, email: u!.email, displayName: name, role: 'member', acceptedInvitationAt: new Date() })
    .returning();
  return { userId: u!.id, memberId: m!.id };
}

describe('getLeaderboards (spec 034)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('ranks beers (voided excluded) + wins, applies the win-rate guard, is club-scoped', async () => {
    const [club] = await testDb.insert(clubs).values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    const a = await mkMember(club!.id, 'Adam');
    const b = await mkMember(club!.id, 'Bohuš');
    const c = await mkMember(club!.id, 'Cyril');
    const [beer] = await testDb
      .insert(beerTypes)
      .values({ clubId: club!.id, name: 'Svijany', unitPriceMinor: 40n, currentStock: 100, createdByUserId: a.userId })
      .returning();
    const [session] = await testDb
      .insert(drinkSessions)
      .values({ clubId: club!.id, openedByUserId: a.userId, startedAt: new Date() })
      .returning();

    const con = (memberId: string) =>
      testDb
        .insert(consumptions)
        .values({ clubId: club!.id, drinkSessionId: session!.id, memberId, beerTypeId: beer!.id, unitPriceMinorSnapshot: 40n, createdByUserId: a.userId })
        .returning()
        .then((r) => r[0]!.id);
    // Adam: 3 non-voided + 1 voided. Bohuš: 1.
    await con(a.memberId);
    await con(a.memberId);
    await con(a.memberId);
    const voided = await con(a.memberId);
    await testDb.insert(consumptionVoids).values({ clubId: club!.id, consumptionId: voided, voidedByUserId: a.userId });
    await con(b.memberId);

    // Matches (agreementId null = legacy-shaped, included): A beats B, A beats B, A beats C, B beats C.
    const mk = (w: string, l: string) =>
      testDb.insert(matches).values({ clubId: club!.id, winnerMemberId: w, loserMemberId: l, playedAt: new Date(), createdByUserId: a.userId });
    await mk(a.memberId, b.memberId);
    await mk(a.memberId, b.memberId);
    await mk(a.memberId, c.memberId);
    await mk(b.memberId, c.memberId);

    // A member of ANOTHER club — must not appear.
    const [club2] = await testDb.insert(clubs).values({ name: 'Other', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    const other = await mkMember(club2!.id, 'Outsider');
    await testDb
      .insert(consumptions)
      .values({ clubId: club2!.id, drinkSessionId: session!.id, memberId: other.memberId, beerTypeId: beer!.id, unitPriceMinorSnapshot: 40n, createdByUserId: other.userId });

    const boards = await getLeaderboards({ clubId: club!.id, viewerMemberId: a.memberId, scope: 'allTime' });
    const byKey = Object.fromEntries(boards.map((bd) => [bd.key, bd]));

    // beers: Adam 3 (voided excluded), Bohuš 1 — Adam tops; Outsider absent.
    expect(byKey.beers!.rows[0]).toMatchObject({ memberId: a.memberId, value: 3, rank: 1 });
    expect(byKey.beers!.rows.map((r) => r.displayName)).not.toContain('Outsider');
    expect(byKey.beers!.rows.find((r) => r.memberId === b.memberId)?.value).toBe(1);

    // wins: Adam 3, Bohuš 1.
    expect(byKey.wins!.rows[0]).toMatchObject({ memberId: a.memberId, value: 3 });

    // win-rate guard: nobody has >=10 matches → board empty.
    expect(byKey.winRate!.rows).toHaveLength(0);

    // played: Adam 3, Bohuš 3, Cyril 2.
    expect(byKey.played!.rows.find((r) => r.memberId === c.memberId)?.value).toBe(2);

    // viewer row resolves (Adam is in the shown rows).
    expect(byKey.beers!.viewerRow?.memberId).toBe(a.memberId);
  });

  it('season scope excludes matches/consumptions older than 90 days', async () => {
    const [club] = await testDb.insert(clubs).values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    const a = await mkMember(club!.id, 'Adam');
    const b = await mkMember(club!.id, 'Bohuš');
    const [beer] = await testDb
      .insert(beerTypes)
      .values({ clubId: club!.id, name: 'Svijany', unitPriceMinor: 40n, currentStock: 100, createdByUserId: a.userId })
      .returning();
    const [session] = await testDb
      .insert(drinkSessions)
      .values({ clubId: club!.id, openedByUserId: a.userId, startedAt: new Date() })
      .returning();
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const recent = new Date();
    // Adam: 1 old beer. Bohuš: 1 recent beer.
    await testDb.insert(consumptions).values({ clubId: club!.id, drinkSessionId: session!.id, memberId: a.memberId, beerTypeId: beer!.id, unitPriceMinorSnapshot: 40n, createdByUserId: a.userId, createdAt: old });
    await testDb.insert(consumptions).values({ clubId: club!.id, drinkSessionId: session!.id, memberId: b.memberId, beerTypeId: beer!.id, unitPriceMinorSnapshot: 40n, createdByUserId: b.userId, createdAt: recent });

    const season = await getLeaderboards({ clubId: club!.id, viewerMemberId: a.memberId, scope: 'season' });
    const beers = season.find((bd) => bd.key === 'beers')!;
    // Only Bohuš's recent beer counts this season.
    expect(beers.rows.map((r) => r.memberId)).toEqual([b.memberId]);
  });
});
