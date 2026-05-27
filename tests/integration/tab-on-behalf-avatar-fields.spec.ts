import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getMyTabForSession } from '@/lib/db/queries/consumption';

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

describe('getMyTabForSession — spec 023 on-behalf logger avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('on-behalf entries carry logger member id + avatar fields; self entries leave them null', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const { consumptions } = await import('@/lib/db/schema/consumption');

    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    // Consumer (whose tab we're inspecting).
    const { user: consumerUser, member: consumer } = await seedMember(
      'consumer',
      club.id,
      {},
    );
    // Logger who logs ON BEHALF of the consumer — has an avatar.
    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { user: loggerUser, member: logger } = await seedMember(
      'pavel-logger',
      club.id,
      { avatarKey: 'star', avatarUploadAt: uploadedAt },
    );

    const [beer] = await testDb
      .insert(beerTypes)
      .values({
        clubId: club.id,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: consumerUser.id,
      })
      .returning();
    if (!beer) throw new Error('seed beer');

    const [session] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: consumerUser.id,
        startedAt: new Date(),
      })
      .returning();
    if (!session) throw new Error('seed session');

    // Self-log (created_by = consumer).
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: consumer.id,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: consumerUser.id,
    });
    // On-behalf log (created_by = logger ≠ consumer's userId).
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: consumer.id,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: loggerUser.id,
    });

    const tab = await getMyTabForSession({
      memberId: consumer.id,
      userId: consumerUser.id,
      session,
      undoWindowSeconds: 60,
    });

    expect(tab.entries.filter((e) => e.kind === 'consumption')).toHaveLength(2);

    const onBehalf = tab.entries.find(
      (e) => e.kind === 'consumption' && e.loggerDisplayName === 'pavel-logger',
    );
    expect(onBehalf).toBeDefined();
    expect(onBehalf?.loggerMemberId).toBe(logger.id);
    expect(onBehalf?.loggerAvatarKey).toBe('star');
    expect(onBehalf?.loggerAvatarUploadAt).toEqual(uploadedAt);

    const selfLog = tab.entries.find(
      (e) => e.kind === 'consumption' && e.loggerDisplayName === null,
    );
    expect(selfLog).toBeDefined();
    expect(selfLog?.loggerMemberId).toBeNull();
    expect(selfLog?.loggerAvatarKey).toBeNull();
    expect(selfLog?.loggerAvatarUploadAt).toBeNull();
  });
});
