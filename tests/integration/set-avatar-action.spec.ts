import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

// requireUnlocked is stubbed per-test so each case can simulate
// "the actor is member X in club Y" or "no membership at all".
const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string } | null;
    club: { id: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { setAvatarAction } from '@/app/[locale]/(app)/account/actions';

async function seedClubAndMember() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `a-${Date.now()}-${Math.random()}@example.test`, name: 'Alice' })
    .returning();
  if (!user) throw new Error('seed user');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'Alice',
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, club, member };
}

async function readAvatarKey(memberId: string): Promise<string | null> {
  const { members } = await import('@/lib/db/schema/members');
  const row = await testDb.query.members.findFirst({
    where: eq(members.id, memberId),
  });
  return row?.avatarKey ?? null;
}

describe('setAvatarAction (spec 020)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — sets a valid key on the active membership row', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setAvatarAction({ avatarKey: 'beer-mug' });

    expect(result.ok).toBe(true);
    expect(await readAvatarKey(member.id)).toBe('beer-mug');
  });

  it('null clears a previously-set avatar', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    await setAvatarAction({ avatarKey: 'star' });
    expect(await readAvatarKey(member.id)).toBe('star');

    const result = await setAvatarAction({ avatarKey: null });

    expect(result.ok).toBe(true);
    expect(await readAvatarKey(member.id)).toBeNull();
  });

  it('empty string is normalized to null', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    await setAvatarAction({ avatarKey: 'trophy' });

    const result = await setAvatarAction({ avatarKey: '' });

    expect(result.ok).toBe(true);
    expect(await readAvatarKey(member.id)).toBeNull();
  });

  it('rejects an invalid key with INVALID_KEY', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setAvatarAction({ avatarKey: 'banana-republic' });

    expect(result).toEqual({ ok: false, code: 'INVALID_KEY' });
    // Row unchanged.
    expect(await readAvatarKey(member.id)).toBeNull();
  });

  it('rejects when the ctx has no active membership', async () => {
    const { user, club } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: null,
      club: { id: club.id },
    };

    const result = await setAvatarAction({ avatarKey: 'star' });

    expect(result).toEqual({ ok: false, code: 'NO_MEMBERSHIP' });
  });
});
