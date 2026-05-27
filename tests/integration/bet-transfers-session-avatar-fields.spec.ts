import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getBetTransfersForSession } from '@/lib/db/queries/bets';

async function seedMember(label: string, clubId: string, avatar: {
  avatarKey?: string | null;
  avatarUploadAt?: Date | null;
}) {
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
      avatarKey: avatar.avatarKey ?? null,
      avatarUploadAt: avatar.avatarUploadAt ?? null,
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, member };
}

describe('getBetTransfersForSession — spec 023 avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns from/to avatar fields on each transfer row', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const { consumptions } = await import('@/lib/db/schema/consumption');
    const { betTransfers } = await import('@/lib/db/schema/bets');

    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { user: u1, member: loser } = await seedMember('loser', club.id, {
      avatarUploadAt: uploadedAt,
    });
    const { member: winner } = await seedMember('winner', club.id, {
      avatarKey: 'star',
    });

    const [beer] = await testDb
      .insert(beerTypes)
      .values({
        clubId: club.id,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: u1.id,
      })
      .returning();
    if (!beer) throw new Error('seed beer');

    const [session] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: u1.id,
        startedAt: new Date(),
      })
      .returning();
    if (!session) throw new Error('seed session');

    const [c] = await testDb
      .insert(consumptions)
      .values({
        clubId: club.id,
        drinkSessionId: session.id,
        memberId: loser.id,
        beerTypeId: beer.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u1.id,
      })
      .returning();
    if (!c) throw new Error('seed consumption');

    await testDb.insert(betTransfers).values({
      clubId: club.id,
      sourceConsumptionId: c.id,
      fromMemberId: loser.id,
      toMemberId: winner.id,
      createdByUserId: u1.id,
    });

    const rows = await getBetTransfersForSession({ sessionId: session.id });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.fromMemberName).toBe('loser');
    expect(row.fromAvatarUploadAt).toEqual(uploadedAt);
    expect(row.fromAvatarKey).toBeNull();
    expect(row.toMemberName).toBe('winner');
    expect(row.toAvatarKey).toBe('star');
    expect(row.toAvatarUploadAt).toBeNull();
  });
});
