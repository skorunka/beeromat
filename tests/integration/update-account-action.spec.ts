import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string };
    club: { id: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireRole: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { updateAccountAction } from '@/app/[locale]/(app)/account/actions';

async function seedMember(label: string) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `${label}-${Date.now()}-${Math.random()}@example.test`, name: label })
    .returning();
  if (!user) throw new Error('seed user');
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: label,
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');
  return { user, club, member };
}

async function readUserName(userId: string) {
  const { eq } = await import('drizzle-orm');
  const { users } = await import('@/lib/db/schema/auth');
  const row = await testDb.query.users.findFirst({
    where: eq(users.id, userId),
  });
  return row?.name ?? null;
}

async function readMemberName(memberId: string) {
  const { eq } = await import('drizzle-orm');
  const { members } = await import('@/lib/db/schema/members');
  const row = await testDb.query.members.findFirst({
    where: eq(members.id, memberId),
  });
  return row?.displayName ?? null;
}

describe('updateAccountAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — updates BOTH users.name and members.displayName in lock-step (FR-006)', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await updateAccountAction({ displayName: 'NewName' });
    expect(result).toEqual({ ok: true });
    expect(await readUserName(user.id)).toBe('NewName');
    expect(await readMemberName(member.id)).toBe('NewName');
  });

  it('trims leading/trailing whitespace before storing', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await updateAccountAction({ displayName: '   Trimmed   ' });
    expect(result).toEqual({ ok: true });
    expect(await readMemberName(member.id)).toBe('Trimmed');
  });

  it('VALIDATION_FAILED on empty display name', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await updateAccountAction({ displayName: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.fieldErrors.displayName?.[0]).toBeTruthy();
    // Member's name unchanged.
    expect(await readMemberName(member.id)).toBe('OldName');
  });

  it('VALIDATION_FAILED on whitespace-only display name', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await updateAccountAction({ displayName: '     ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('VALIDATION_FAILED on a 81-char display name', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await updateAccountAction({ displayName: 'x'.repeat(81) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('accepts a 80-char display name (boundary)', async () => {
    const { user, club, member } = await seedMember('OldName');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await updateAccountAction({ displayName: 'x'.repeat(80) });
    expect(result).toEqual({ ok: true });
  });

  it('preserves Czech diacritics', async () => {
    const { user, club, member } = await seedMember('Pavel');
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await updateAccountAction({ displayName: 'Žofie' });
    expect(result).toEqual({ ok: true });
    expect(await readMemberName(member.id)).toBe('Žofie');
  });
});
