import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getPendingClaimsForTreasurer } from '@/lib/db/queries/payments';

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

async function seedClaim(
  clubId: string,
  memberId: string,
  userId: string,
  amount: bigint,
) {
  const { payments } = await import('@/lib/db/schema/payments');
  const [p] = await testDb
    .insert(payments)
    .values({
      clubId,
      memberId,
      amountMinor: amount,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: userId,
    })
    .returning();
  if (!p) throw new Error('seed payment');
  return p;
}

describe('getPendingClaimsForTreasurer — spec 023 avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('projects memberAvatarKey + memberAvatarUploadAt on each pending claim', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { user: u1, member: m1 } = await seedMember('with-photo', club.id, {
      avatarUploadAt: uploadedAt,
    });
    const { user: u2, member: m2 } = await seedMember('with-glyph', club.id, {
      avatarKey: 'trophy',
    });
    const { user: u3, member: m3 } = await seedMember('plain', club.id, {});

    await seedClaim(club.id, m1.id, u1.id, 100n);
    await seedClaim(club.id, m2.id, u2.id, 200n);
    await seedClaim(club.id, m3.id, u3.id, 300n);

    const rows = await getPendingClaimsForTreasurer(club.id);
    expect(rows).toHaveLength(3);

    const byName = new Map(rows.map((r) => [r.memberDisplayName, r]));
    expect(byName.get('with-photo')?.memberAvatarKey).toBeNull();
    expect(byName.get('with-photo')?.memberAvatarUploadAt).toEqual(uploadedAt);
    expect(byName.get('with-glyph')?.memberAvatarKey).toBe('trophy');
    expect(byName.get('with-glyph')?.memberAvatarUploadAt).toBeNull();
    expect(byName.get('plain')?.memberAvatarKey).toBeNull();
    expect(byName.get('plain')?.memberAvatarUploadAt).toBeNull();
  });
});
