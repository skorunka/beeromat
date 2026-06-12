import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

// 2026-06-12 fix — the sign-in form's allowlist used to send a plain
// magic link to an email matching ANY invitation. For a PENDING (never
// accepted) invitation there is no user row yet, and Better Auth's
// disableSignUp blocks creation at verify time, so that link silently
// bounced the invitee back to /sign-in. requestMagicLinkAction now
// routes unaccepted invitees through invitation re-send instead.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const { signInMagicLinkMock, sendInvitationMock, sendMagicLinkMock } = vi.hoisted(() => ({
  signInMagicLinkMock: vi.fn(async () => ({})),
  sendInvitationMock: vi.fn(async () => {}),
  sendMagicLinkMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/env', () => ({
  env: { BETTER_AUTH_URL: 'http://test.local', AUTH_RATE_LIMIT_ENABLED: 'false' },
}));
vi.mock('@/lib/email/mailer', () => ({
  sendInvitation: sendInvitationMock,
  sendMagicLink: sendMagicLinkMock,
}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { signInMagicLink: signInMagicLinkMock } },
}));
vi.mock('@/lib/turnstile/verify', () => ({ verifyTurnstileToken: async () => true }));
vi.mock('@/lib/rate-limit', () => ({ checkMagicLinkLimits: async () => ({ allowed: true }) }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'cs' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock('@/lib/auth/session', () => ({
  requireMember: async () => {
    throw new Error('requireMember should not be called in this flow');
  },
  DEVICE_ID_COOKIE: 'device_id',
}));

import { requestMagicLinkAction } from '@/lib/auth/actions';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members, invitations } from '@/lib/db/schema/members';

async function seedClubAndInviter() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TK Test', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [inviter] = await testDb
    .insert(users)
    .values({ email: `admin-${Math.random()}@x.test`, name: 'Admin', emailVerified: true })
    .returning();
  return { clubId: club!.id, inviterId: inviter!.id };
}

describe('requestMagicLinkAction — invited-but-not-accepted routing', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    signInMagicLinkMock.mockClear();
    sendInvitationMock.mockClear();
    sendMagicLinkMock.mockClear();
  });

  it('pending invitation, no user yet → re-sends the invitation (not a magic link)', async () => {
    const { clubId, inviterId } = await seedClubAndInviter();
    const email = 'invitee@x.test';
    const [inv] = await testDb
      .insert(invitations)
      .values({
        clubId,
        email,
        role: 'member',
        tokenHash: 'placeholder-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
        createdByUserId: inviterId,
      })
      .returning();

    const result = await requestMagicLinkAction({ email, turnstileToken: 'tok' });

    expect(result).toEqual({ ok: true, data: { status: 'sent' } });
    // Routed through invitation acceptance, NOT a dead magic link.
    expect(sendInvitationMock).toHaveBeenCalledTimes(1);
    expect(signInMagicLinkMock).not.toHaveBeenCalled();
    // The token was re-issued on the same row (fresh hash + expiry).
    const after = (
      await testDb.select().from(invitations).where(eq(invitations.id, inv!.id))
    )[0]!;
    expect(after.tokenHash).not.toBe('placeholder-hash');
  });

  it('accepted member (user row exists) → normal magic link', async () => {
    const { clubId } = await seedClubAndInviter();
    const email = 'member@x.test';
    const [u] = await testDb
      .insert(users)
      .values({ email, name: 'Member', emailVerified: true })
      .returning();
    await testDb.insert(members).values({
      clubId,
      userId: u!.id,
      email,
      displayName: 'Member',
      role: 'member',
      acceptedInvitationAt: new Date(),
    });

    const result = await requestMagicLinkAction({ email, turnstileToken: 'tok' });

    expect(result).toEqual({ ok: true, data: { status: 'sent' } });
    expect(signInMagicLinkMock).toHaveBeenCalledTimes(1);
    expect(sendInvitationMock).not.toHaveBeenCalled();
  });

  it('unknown email (users table non-empty) → not-on-allowlist, nothing sent', async () => {
    await seedClubAndInviter(); // seeds a user → not a fresh/bootstrap install
    const result = await requestMagicLinkAction({
      email: 'stranger@x.test',
      turnstileToken: 'tok',
    });

    expect(result).toEqual({ ok: true, data: { status: 'not-on-allowlist' } });
    expect(signInMagicLinkMock).not.toHaveBeenCalled();
    expect(sendInvitationMock).not.toHaveBeenCalled();
  });
});
