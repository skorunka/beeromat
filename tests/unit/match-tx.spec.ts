import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { logMatchTx, voidMatchTx } from '@/lib/db/queries/matches';
import { users } from '@/lib/db/schema/auth';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import { matchBetTransfers, matches } from '@/lib/db/schema/matches';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';

async function seedScenario() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  if (!club) throw new Error('club');

  const [userA, userB] = await Promise.all([
    testDb.insert(users).values({ email: 'a@x.test', name: 'A', emailVerified: true }).returning(),
    testDb.insert(users).values({ email: 'b@x.test', name: 'B', emailVerified: true }).returning(),
  ]);
  const [memberA] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: userA[0]!.id,
      email: 'a@x.test',
      displayName: 'A',
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  const [memberB] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: userB[0]!.id,
      email: 'b@x.test',
      displayName: 'B',
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  if (!memberA || !memberB) throw new Error('members');

  return { club, userA: userA[0]!, userB: userB[0]!, memberA, memberB };
}

async function seedSessionWithBeer(
  clubId: string,
  memberId: string,
  userId: string,
  count: number,
) {
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId, openedByUserId: userId, startedAt: new Date() })
    .returning();
  if (!session) throw new Error('session');
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: userId,
    })
    .returning();
  if (!beer) throw new Error('beer');
  for (let i = 0; i < count; i += 1) {
    await testDb.insert(consumptions).values({
      clubId,
      drinkSessionId: session.id,
      memberId,
      beerTypeId: beer.id,
      createdByUserId: userId,
      unitPriceMinorSnapshot: 5000n,
    });
  }
  return session;
}

describe('logMatchTx — spec 012', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('inserts matches row even when no open session exists (no transfer)', async () => {
    const { club, userA, memberA, memberB } = await seedScenario();
    const result = await logMatchTx({
      clubId: club.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      createdByUserId: userA.id,
      beerCount: 1,
    });
    expect(result.transferredCount).toBe(0);
    expect(result.requestedCount).toBe(1);
    const m = await testDb.select().from(matches);
    expect(m).toHaveLength(1);
    expect(m[0]?.winnerMemberId).toBe(memberA.id);
  });

  it('transfers N winner consumptions when session + beers exist', async () => {
    const { club, userA, memberA, memberB } = await seedScenario();
    await seedSessionWithBeer(club.id, memberA.id, userA.id, 3);

    const result = await logMatchTx({
      clubId: club.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      createdByUserId: userA.id,
      beerCount: 2,
    });
    expect(result.transferredCount).toBe(2);
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.fromMemberId === memberA.id)).toBe(true);
    expect(transfers.every((t) => t.toMemberId === memberB.id)).toBe(true);
    const links = await testDb.select().from(matchBetTransfers);
    expect(links).toHaveLength(2);
  });

  it('voidMatchTx soft-deletes match and voids all linked transfers', async () => {
    const { club, userA, memberA, memberB } = await seedScenario();
    await seedSessionWithBeer(club.id, memberA.id, userA.id, 2);
    const log = await logMatchTx({
      clubId: club.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      createdByUserId: userA.id,
      beerCount: 2,
    });

    const voidResult = await voidMatchTx({
      matchId: log.matchId,
      clubId: club.id,
      voidedByUserId: userA.id,
      reason: 'test undo',
    });
    expect(voidResult.voided).toBe(true);
    expect(voidResult.voidedTransferCount).toBe(2);

    const m = await testDb.select().from(matches);
    expect(m[0]?.voidedAt).not.toBeNull();
    const voids = await testDb.select().from(betTransferVoids);
    expect(voids).toHaveLength(2);
  });

  it('voidMatchTx no-ops on an already-voided match', async () => {
    const { club, userA, memberA, memberB } = await seedScenario();
    const log = await logMatchTx({
      clubId: club.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      createdByUserId: userA.id,
      beerCount: 1,
    });
    await voidMatchTx({ matchId: log.matchId, clubId: club.id, voidedByUserId: userA.id });
    const second = await voidMatchTx({
      matchId: log.matchId,
      clubId: club.id,
      voidedByUserId: userA.id,
    });
    expect(second.voided).toBe(false);
  });
});
