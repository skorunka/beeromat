import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

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

import { setSessionTitleAction } from '@/app/[locale]/(app)/tab/actions';

async function seedClubAndMember(label: string) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({
      email: `${label}-${Date.now()}-${Math.random()}@example.test`,
      name: label,
    })
    .returning();
  if (!user) throw new Error('seed user');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: `Club ${label}`, currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
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

async function seedSession(opts: {
  clubId: string;
  openedByUserId: string;
  endedAt?: Date | null;
}) {
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const [s] = await testDb
    .insert(drinkSessions)
    .values({
      clubId: opts.clubId,
      openedByUserId: opts.openedByUserId,
      startedAt: new Date(),
      endedAt: opts.endedAt ?? null,
    })
    .returning();
  if (!s) throw new Error('seed session');
  return s;
}

async function readTitle(sessionId: string): Promise<string | null> {
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const row = await testDb.query.drinkSessions.findFirst({
    where: eq(drinkSessions.id, sessionId),
  });
  return row?.title ?? null;
}

describe('setSessionTitleAction (spec 022)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy set — stores a trimmed title on an open session', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const session = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setSessionTitleAction({
      sessionId: session.id,
      title: 'Středeční debly',
    });

    expect(result).toEqual({ ok: true, title: 'Středeční debly' });
    expect(await readTitle(session.id)).toBe('Středeční debly');
  });

  it('happy clear — null clears a previously-set title', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const session = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    await setSessionTitleAction({ sessionId: session.id, title: 'something' });
    const result = await setSessionTitleAction({
      sessionId: session.id,
      title: null,
    });

    expect(result).toEqual({ ok: true, title: null });
    expect(await readTitle(session.id)).toBeNull();
  });

  it('whitespace-only clears to NULL', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const session = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    await setSessionTitleAction({ sessionId: session.id, title: 'set' });

    const result = await setSessionTitleAction({
      sessionId: session.id,
      title: '   \t\n  ',
    });

    expect(result).toEqual({ ok: true, title: null });
    expect(await readTitle(session.id)).toBeNull();
  });

  it('trims leading + trailing whitespace before storing', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const session = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setSessionTitleAction({
      sessionId: session.id,
      title: '   Po finále s Plzní   ',
    });

    expect(result).toEqual({ ok: true, title: 'Po finále s Plzní' });
    expect(await readTitle(session.id)).toBe('Po finále s Plzní');
  });

  it('over-cap (61+ chars after trim) returns VALIDATION_FAILED; DB unchanged', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const session = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setSessionTitleAction({
      sessionId: session.id,
      title: 'x'.repeat(61),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_FAILED');
    expect(await readTitle(session.id)).toBeNull();
  });

  it('cross-club edit returns NOT_FOUND and leaves target row untouched', async () => {
    const a = await seedClubAndMember('alice');
    const b = await seedClubAndMember('bob');
    const bSession = await seedSession({
      clubId: b.club.id,
      openedByUserId: b.user.id,
    });
    // Pre-populate bob's session title so we can verify it stays put.
    ctxRef.current = {
      user: { id: b.user.id },
      member: { id: b.member.id, role: 'member' },
      club: { id: b.club.id },
    };
    await setSessionTitleAction({ sessionId: bSession.id, title: 'bobs round' });

    // Now alice tries to edit bob's session.
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.member.id, role: 'member' },
      club: { id: a.club.id },
    };
    const result = await setSessionTitleAction({
      sessionId: bSession.id,
      title: 'alice was here',
    });

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await readTitle(bSession.id)).toBe('bobs round');
  });

  it('retroactive — title can be set on a closed session (Q2 → β)', async () => {
    const { user, club, member } = await seedClubAndMember('alice');
    const closed = await seedSession({
      clubId: club.id,
      openedByUserId: user.id,
      endedAt: new Date(),
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await setSessionTitleAction({
      sessionId: closed.id,
      title: 'reconcile-tag',
    });

    expect(result).toEqual({ ok: true, title: 'reconcile-tag' });
    expect(await readTitle(closed.id)).toBe('reconcile-tag');
  });
});
