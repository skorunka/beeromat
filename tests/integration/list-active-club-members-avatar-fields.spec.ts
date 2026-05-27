import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { listActiveClubMembers } from '@/lib/db/queries/match-agreements';

async function seedMember(label: string, clubId: string, opts: {
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
      avatarKey: opts.avatarKey ?? null,
      avatarUploadAt: opts.avatarUploadAt ?? null,
      isActive: opts.isActive ?? true,
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, member };
}

describe('listActiveClubMembers — spec 024 avatar fields + active-only filter', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns active members with avatar fields, skips inactive members', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    await seedMember('photo', club.id, { avatarUploadAt: uploadedAt });
    await seedMember('glyph', club.id, { avatarKey: 'star' });
    await seedMember('plain', club.id, {});
    await seedMember('inactive', club.id, { isActive: false });

    const rows = await listActiveClubMembers(club.id);

    expect(rows).toHaveLength(3);
    const byName = new Map(rows.map((r) => [r.displayName, r]));
    expect(byName.get('photo')?.avatarUploadAt).toEqual(uploadedAt);
    expect(byName.get('photo')?.avatarKey).toBeNull();
    expect(byName.get('glyph')?.avatarKey).toBe('star');
    expect(byName.get('glyph')?.avatarUploadAt).toBeNull();
    expect(byName.get('plain')?.avatarKey).toBeNull();
    expect(byName.get('plain')?.avatarUploadAt).toBeNull();
    expect(byName.get('inactive')).toBeUndefined();
  });
});
