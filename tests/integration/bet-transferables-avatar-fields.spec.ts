import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getTransferableConsumptionsForCurrentSession } from '@/lib/db/queries/bets';

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

describe('getTransferableConsumptionsForCurrentSession — spec 023 avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns ownerAvatarKey + ownerAvatarUploadAt on each transferable row', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const { consumptions } = await import('@/lib/db/schema/consumption');

    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const { user: actorUser, member: actor } = await seedMember('actor', club.id, {});
    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { member: photoOwner } = await seedMember('photo-owner', club.id, {
      avatarUploadAt: uploadedAt,
    });
    const { member: glyphOwner } = await seedMember('glyph-owner', club.id, {
      avatarKey: 'trophy',
    });

    const [beer] = await testDb
      .insert(beerTypes)
      .values({
        clubId: club.id,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: actorUser.id,
      })
      .returning();
    if (!beer) throw new Error('seed beer');

    const [session] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: actorUser.id,
        startedAt: new Date(),
      })
      .returning();
    if (!session) throw new Error('seed session');

    // Two consumptions owned by NOT-the-actor (transferable).
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: photoOwner.id,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: actorUser.id,
    });
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: glyphOwner.id,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: actorUser.id,
    });

    const { consumptions: rows } = await getTransferableConsumptionsForCurrentSession({
      clubId: club.id,
      memberId: actor.id,
    });

    expect(rows).toHaveLength(2);
    const byOwner = new Map(rows.map((r) => [r.ownerDisplayName, r]));
    expect(byOwner.get('photo-owner')?.ownerAvatarUploadAt).toEqual(uploadedAt);
    expect(byOwner.get('photo-owner')?.ownerAvatarKey).toBeNull();
    expect(byOwner.get('glyph-owner')?.ownerAvatarKey).toBe('trophy');
    expect(byOwner.get('glyph-owner')?.ownerAvatarUploadAt).toBeNull();
  });
});
