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

// admin/members/actions.ts directly imports `env` for the invite
// flow's BASE_URL / SMTP config. We never invoke invite from these
// tests, but the import chain triggers env validation at module
// load. Stub env + the mailer so no env is required.
vi.mock('@/lib/env', () => ({
  env: {
    BASE_URL: 'http://test.local',
    SMTP_URL: 'smtp://test',
    EMAIL_FROM: 'test@test.local',
  },
}));
vi.mock('@/lib/email/mailer', () => ({
  sendInvitation: vi.fn(async () => {}),
  sendMagicLink: vi.fn(async () => {}),
}));

import {
  changeMemberRoleAction,
  setMemberActiveAction,
  revokeInvitationAction,
} from '@/app/[locale]/(app)/admin/members/actions';

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

async function seedRegularMember(clubId: string, label: string) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');
  const [u] = await testDb
    .insert(users)
    .values({ email: `${label}-${Date.now()}-${Math.random()}@example.test`, name: label })
    .returning();
  if (!u) throw new Error('seed user');
  const [m] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: u.id,
      email: u.email,
      displayName: label,
      role: 'member',
    })
    .returning();
  if (!m) throw new Error('seed member');
  return { u, m };
}

async function readMember(memberId: string) {
  const { eq } = await import('drizzle-orm');
  const { members } = await import('@/lib/db/schema/members');
  return testDb.query.members.findFirst({ where: eq(members.id, memberId) });
}

describe('changeMemberRoleAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — promotes a member to treasurer', async () => {
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    const { m: target } = await seedRegularMember(club.id, 'pavel');
    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    const result = await changeMemberRoleAction({
      memberId: target.id,
      role: 'treasurer',
    });
    expect(result).toEqual({ ok: true });

    const updated = await readMember(target.id);
    expect(updated?.role).toBe('treasurer');
  });

  it('refuses self-modification with CANT_SELF_MODIFY', async () => {
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    const result = await changeMemberRoleAction({
      memberId: admin.id, // self
      role: 'member',
    });
    expect(result).toEqual({ ok: false, code: 'CANT_SELF_MODIFY' });
    // Role unchanged.
    expect((await readMember(admin.id))?.role).toBe('club_admin');
  });

  it('cross-club target returns NOT_FOUND (no leak of other-club existence)', async () => {
    const a = await seedClubWithAdmin();
    const b = await seedClubWithAdmin();
    const { m: bTarget } = await seedRegularMember(b.club.id, 'cross');

    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.admin.id, role: 'club_admin' },
      club: { id: a.club.id },
    };
    const result = await changeMemberRoleAction({
      memberId: bTarget.id,
      role: 'treasurer',
    });
    // Returns NOT_FOUND not CROSS_CLUB — doesn't reveal whether the
    // id exists somewhere else in the system.
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
    // Cross-club row is untouched.
    expect((await readMember(bTarget.id))?.role).toBe('member');
  });

  it('non-existent memberId returns NOT_FOUND', async () => {
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await changeMemberRoleAction({
      memberId: '00000000-0000-0000-0000-000000000000',
      role: 'treasurer',
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('setMemberActiveAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('deactivates a member (soft-delete; isActive flips to false)', async () => {
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    const { m: target } = await seedRegularMember(club.id, 'pavel');
    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    const result = await setMemberActiveAction({
      memberId: target.id,
      isActive: false,
    });
    expect(result).toEqual({ ok: true });
    expect((await readMember(target.id))?.isActive).toBe(false);
  });

  it('refuses self-modification with CANT_SELF_MODIFY', async () => {
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };

    const result = await setMemberActiveAction({
      memberId: admin.id,
      isActive: false,
    });
    expect(result).toEqual({ ok: false, code: 'CANT_SELF_MODIFY' });
    // Still active.
    expect((await readMember(admin.id))?.isActive).toBe(true);
  });

  it('cross-club target returns NOT_FOUND', async () => {
    const a = await seedClubWithAdmin();
    const b = await seedClubWithAdmin();
    const { m: bTarget } = await seedRegularMember(b.club.id, 'cross');

    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.admin.id, role: 'club_admin' },
      club: { id: a.club.id },
    };
    const result = await setMemberActiveAction({
      memberId: bTarget.id,
      isActive: false,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect((await readMember(bTarget.id))?.isActive).toBe(true);
  });
});

describe('revokeInvitationAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('revokes a pending invitation', async () => {
    const { invitations } = await import('@/lib/db/schema/members');
    const { eq } = await import('drizzle-orm');
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    const [inv] = await testDb
      .insert(invitations)
      .values({
        clubId: club.id,
        email: 'invited@example.test',
        role: 'member',
        tokenHash: 'hash',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: adminUser.id,
      })
      .returning();
    if (!inv) throw new Error('seed invitation');

    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await revokeInvitationAction({ invitationId: inv.id });
    expect(result).toEqual({ ok: true });

    const after = await testDb.query.invitations.findFirst({
      where: eq(invitations.id, inv.id),
    });
    expect(after?.status).toBe('revoked');
  });

  it('rejects a non-pending invitation with INVALID_STATE', async () => {
    const { invitations } = await import('@/lib/db/schema/members');
    const { user: adminUser, club, admin } = await seedClubWithAdmin();
    const [inv] = await testDb
      .insert(invitations)
      .values({
        clubId: club.id,
        email: 'invited@example.test',
        role: 'member',
        tokenHash: 'hash',
        status: 'accepted',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: adminUser.id,
      })
      .returning();
    if (!inv) throw new Error('seed invitation');

    ctxRef.current = {
      user: { id: adminUser.id },
      member: { id: admin.id, role: 'club_admin' },
      club: { id: club.id },
    };
    const result = await revokeInvitationAction({ invitationId: inv.id });
    expect(result).toEqual({ ok: false, code: 'INVALID_STATE' });
  });

  it('cross-club invitation returns NOT_FOUND', async () => {
    const { invitations } = await import('@/lib/db/schema/members');
    const a = await seedClubWithAdmin();
    const b = await seedClubWithAdmin();
    const [bInv] = await testDb
      .insert(invitations)
      .values({
        clubId: b.club.id,
        email: 'cross@example.test',
        role: 'member',
        tokenHash: 'hash',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: b.user.id,
      })
      .returning();
    if (!bInv) throw new Error('seed b invitation');

    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.admin.id, role: 'club_admin' },
      club: { id: a.club.id },
    };
    const result = await revokeInvitationAction({ invitationId: bInv.id });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
