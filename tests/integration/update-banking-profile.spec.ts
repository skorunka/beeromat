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
  requireRole: async () => ctxRef.current!,
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { updateBankingProfileAction } from '@/app/[locale]/(app)/admin/settings/actions';

// A real Czech IBAN with a valid mod-97 checksum, used in payment
// QR code tests across the project. CZ65 0800 0000 1920 0014 5399.
const VALID_IBAN_CZ = 'CZ6508000000192000145399';

async function seedClubWithAdmin() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `admin-${Date.now()}-${Math.random()}@example.test`, name: 'A' })
    .returning();
  if (!user) throw new Error('seed user');
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  const [admin] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'A',
      role: 'club_admin',
    })
    .returning();
  if (!admin) throw new Error('seed admin');
  return { user, club, admin };
}

async function readProfile(clubId: string) {
  const { eq } = await import('drizzle-orm');
  const { clubBankingProfiles } = await import('@/lib/db/schema/clubs');
  return testDb.query.clubBankingProfiles.findFirst({
    where: eq(clubBankingProfiles.clubId, clubId),
  });
}

describe('updateBankingProfileAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — first call inserts the banking profile', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    const result = await updateBankingProfileAction({
      iban: VALID_IBAN_CZ,
      accountHolderName: 'TC Test z.s.',
      revolutHandle: '@tctest',
      defaultQrMessage: 'beeromat',
    });
    expect(result).toEqual({ ok: true });

    const profile = await readProfile(club.id);
    expect(profile?.iban).toBe(VALID_IBAN_CZ);
    expect(profile?.accountHolderName).toBe('TC Test z.s.');
    expect(profile?.revolutHandle).toBe('@tctest');
    expect(profile?.defaultQrMessage).toBe('beeromat');
  });

  it('upserts — second call updates the same row (one profile per club)', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    await updateBankingProfileAction({ iban: VALID_IBAN_CZ });
    await updateBankingProfileAction({ revolutHandle: '@newhandle' });

    const profile = await readProfile(club.id);
    // IBAN preserved from the first call.
    expect(profile?.iban).toBe(VALID_IBAN_CZ);
    // Handle from the second call.
    expect(profile?.revolutHandle).toBe('@newhandle');
  });

  it('INVALID_IBAN on a structurally-valid but checksum-failed IBAN', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    // Same length + character class as the real one, but the
    // checksum digits are 00 which fails mod-97.
    const badIban = 'CZ0008000000192000145399';
    const result = await updateBankingProfileAction({ iban: badIban });
    expect(result).toEqual({ ok: false, code: 'INVALID_IBAN' });
    // No profile row written.
    expect(await readProfile(club.id)).toBeUndefined();
  });

  it('INVALID_INPUT when IBAN fails the structural regex', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateBankingProfileAction({ iban: 'not-an-iban' });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('null IBAN clears the field (toggles off member self-pay)', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    // First set an IBAN.
    await updateBankingProfileAction({ iban: VALID_IBAN_CZ });
    expect((await readProfile(club.id))?.iban).toBe(VALID_IBAN_CZ);

    // Then explicitly clear it.
    const result = await updateBankingProfileAction({ iban: null });
    expect(result).toEqual({ ok: true });
    expect((await readProfile(club.id))?.iban).toBeNull();
  });

  it('accepts a spaced IBAN (the way users paste from bank apps) and normalizes before storing', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateBankingProfileAction({
      iban: 'CZ65 0800 0000 1920 0014 5399',
    });
    expect(result).toEqual({ ok: true });
    expect((await readProfile(club.id))?.iban).toBe(VALID_IBAN_CZ);
  });

  it('accepts a lower-case IBAN and stores upper-case', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await updateBankingProfileAction({
      iban: 'cz6508000000192000145399',
    });
    expect(result).toEqual({ ok: true });
    expect((await readProfile(club.id))?.iban).toBe(VALID_IBAN_CZ);
  });

  it('partial patch — only updates the keys present in the input', async () => {
    const { user, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    await updateBankingProfileAction({
      iban: VALID_IBAN_CZ,
      accountHolderName: 'Original',
      revolutHandle: '@original',
    });

    // Patch with ONLY revolutHandle — iban + accountHolderName
    // must be preserved.
    await updateBankingProfileAction({ revolutHandle: '@updated' });

    const profile = await readProfile(club.id);
    expect(profile?.iban).toBe(VALID_IBAN_CZ);
    expect(profile?.accountHolderName).toBe('Original');
    expect(profile?.revolutHandle).toBe('@updated');
  });
});
