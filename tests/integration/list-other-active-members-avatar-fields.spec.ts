import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { listOtherActiveMembers } from '@/lib/db/queries/members';

async function seedMember(label: string, clubId: string, avatar: {
  avatarKey?: string | null;
  avatarUploadAt?: Date | null;
  isActive?: boolean;
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
      isActive: avatar.isActive ?? true,
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, member };
}

describe('listOtherActiveMembers — spec 024 picker query', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns active members other than the caller with avatar fields', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const { member: caller } = await seedMember('caller', club.id, {});
    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { member: photo } = await seedMember('photo', club.id, {
      avatarUploadAt: uploadedAt,
    });
    const { member: glyph } = await seedMember('glyph', club.id, {
      avatarKey: 'trophy',
    });
    const { member: plain } = await seedMember('plain', club.id, {});
    await seedMember('inactive', club.id, { isActive: false });

    const rows = await listOtherActiveMembers(club.id, caller.id);

    // Caller and the inactive member must be excluded.
    expect(rows.map((r) => r.id).sort()).toEqual(
      [photo.id, glyph.id, plain.id].sort(),
    );

    const byName = new Map(rows.map((r) => [r.displayName, r]));
    expect(byName.get('photo')?.avatarUploadAt).toEqual(uploadedAt);
    expect(byName.get('photo')?.avatarKey).toBeNull();
    expect(byName.get('glyph')?.avatarKey).toBe('trophy');
    expect(byName.get('glyph')?.avatarUploadAt).toBeNull();
    expect(byName.get('plain')?.avatarKey).toBeNull();
    expect(byName.get('plain')?.avatarUploadAt).toBeNull();
  });

  it('orders results by displayName ascending', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const { member: caller } = await seedMember('aaa-caller', club.id, {});
    await seedMember('zoe', club.id, {});
    await seedMember('bob', club.id, {});
    await seedMember('eve', club.id, {});

    const rows = await listOtherActiveMembers(club.id, caller.id);
    expect(rows.map((r) => r.displayName)).toEqual(['bob', 'eve', 'zoe']);
  });
});
