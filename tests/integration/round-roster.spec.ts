import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 033 follow-up — listActiveMembersForRound orders the roster
// self-first, then the caller's recent companions (people they've logged
// beers for), then everyone else alphabetically.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { listActiveMembersForRound } from '@/lib/db/queries/members';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions } from '@/lib/db/schema/consumption';

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

describe('listActiveMembersForRound — recency ordering (spec 033)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('puts self first, then recent companions, then the rest alphabetically', async () => {
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' })
      .returning();
    const self = await mkMember(club!.id, 'Franta');
    const adam = await mkMember(club!.id, 'Adam');
    const bohus = await mkMember(club!.id, 'Bohuš');
    const cyril = await mkMember(club!.id, 'Cyril');

    // Self logs a beer FOR Bohuš → Bohuš becomes a recent companion.
    const [beer] = await testDb
      .insert(beerTypes)
      .values({ clubId: club!.id, name: 'Svijany', unitPriceMinor: 40n, currentStock: 10, createdByUserId: self.userId })
      .returning();
    const [session] = await testDb
      .insert(drinkSessions)
      .values({ clubId: club!.id, openedByUserId: self.userId, startedAt: new Date() })
      .returning();
    await testDb.insert(consumptions).values({
      clubId: club!.id,
      drinkSessionId: session!.id,
      memberId: bohus.memberId,
      beerTypeId: beer!.id,
      unitPriceMinorSnapshot: 40n,
      createdByUserId: self.userId,
    });

    const roster = await listActiveMembersForRound(club!.id, self.memberId, self.userId);

    // Order: Franta (self) → Bohuš (recent companion) → Adam, Cyril (alpha).
    expect(roster.map((m) => m.displayName)).toEqual(['Franta', 'Bohuš', 'Adam', 'Cyril']);
    expect(roster[0]).toMatchObject({ isSelf: true });
    expect(roster[1]).toMatchObject({ displayName: 'Bohuš', recent: true });
    expect(roster.find((m) => m.displayName === 'Adam')!.recent).toBe(false);
  });
});
