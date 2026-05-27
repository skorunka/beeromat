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
  requireRole: async (...roles: string[]) => {
    if (!ctxRef.current) throw new Error('not authenticated');
    if (!roles.includes(ctxRef.current.member.role)) {
      throw new Error('forbidden');
    }
    return ctxRef.current;
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { updateClubConfigAction } from '@/app/[locale]/(app)/admin/config/actions';

async function seedClubWithMember(opts: { role: 'member' | 'club_admin' | 'treasurer' }) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@example.test`, name: 'U' })
    .returning();
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Original', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: user!.id,
      email: user!.email,
      displayName: 'U',
      role: opts.role,
    })
    .returning();
  return { user: user!, club: club!, member: member! };
}

async function readClub(clubId: string) {
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { eq } = await import('drizzle-orm');
  return testDb.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
}

describe('updateClubConfigAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — admin updates name + currency + locale', async () => {
    const { user, club, member } = await seedClubWithMember({ role: 'club_admin' });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateClubConfigAction({
      name: 'Renamed Club',
      currencyCode: 'EUR',
      defaultLocale: 'en',
    });
    expect(result).toEqual({ ok: true });
    const fresh = await readClub(club.id);
    expect(fresh?.name).toBe('Renamed Club');
    expect(fresh?.currencyCode).toBe('EUR');
    expect(fresh?.defaultLocale).toBe('en');
  });

  it('FORBIDDEN — non-admin role rejected even with valid input', async () => {
    const { user, club, member } = await seedClubWithMember({ role: 'treasurer' });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await updateClubConfigAction({
      name: 'Should not stick',
      currencyCode: 'EUR',
      defaultLocale: 'en',
    });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    // Club row untouched.
    const fresh = await readClub(club.id);
    expect(fresh?.name).toBe('Original');
    expect(fresh?.currencyCode).toBe('CZK');
  });

  it('INVALID_INPUT — empty name fails Zod min(1)', async () => {
    const { user, club, member } = await seedClubWithMember({ role: 'club_admin' });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateClubConfigAction({
      name: '   ',
      currencyCode: 'EUR',
      defaultLocale: 'en',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('INVALID_INPUT — lowercase currency code fails the regex', async () => {
    const { user, club, member } = await seedClubWithMember({ role: 'club_admin' });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateClubConfigAction({
      name: 'X',
      currencyCode: 'eur',
      defaultLocale: 'en',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('INVALID_INPUT — locale outside routing.locales fails the enum', async () => {
    const { user, club, member } = await seedClubWithMember({ role: 'club_admin' });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateClubConfigAction({
      name: 'X',
      currencyCode: 'EUR',
      defaultLocale: 'xx',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('club_id scoping — admin can only update their own club', async () => {
    // Seed two clubs; admin of A. The action only edits ctx.club.id;
    // we'd never even be ABLE to point the update at club B without
    // changing the context. Verify B is untouched after a successful
    // A update.
    const a = await seedClubWithMember({ role: 'club_admin' });
    const b = await seedClubWithMember({ role: 'club_admin' });
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.member.id, role: 'club_admin' },
      club: { id: a.club.id },
    };
    await updateClubConfigAction({
      name: 'A renamed',
      currencyCode: 'EUR',
      defaultLocale: 'en',
    });
    const bFresh = await readClub(b.club.id);
    expect(bFresh?.name).toBe('Original');
    expect(bFresh?.currencyCode).toBe('CZK');
  });
});
