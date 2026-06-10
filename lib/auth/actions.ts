'use server';

import { randomBytes, randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { invitations, members, deviceSessions } from '@/lib/db/schema/members';
import { clubs } from '@/lib/db/schema/clubs';
import { users } from '@/lib/db/schema/auth';
import { requireMember } from '@/lib/auth/session';
import { DEVICE_ID_COOKIE } from '@/lib/auth/session';
import { hashPin, isValidPinFormat, verifyPin } from '@/lib/auth/pin';
import { auth } from '@/lib/auth/better-auth';
import { sendInvitation } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { Locale } from '@/lib/i18n/routing';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';
import { checkMagicLinkLimits } from '@/lib/rate-limit';
import { acceptInvitationSchema } from '@/lib/validation/invitation';

const MAX_PIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 100 * 365 * 24 * 60 * 60 * 1000; // 100 years ~ effectively permanent

const deviceCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365, // 365 days
  path: '/',
};

export type AuthActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; code: string; message?: string; attemptsRemaining?: number };

/**
 * Accept an invitation. Creates Better Auth user + members row + marks
 * invitation accepted, then triggers a magic-link send so the user can
 * sign in cleanly via Better Auth's normal flow. The display name is
 * collected here; the PIN is set later by the (app)/layout PIN gate
 * after first sign-in.
 */
export async function acceptInvitationAction(input: {
  token: string;
  displayName: string;
}): Promise<AuthActionResult<{ email: string }>> {
  // Validate the display name against the same schema the client form uses
  // (lib/validation/invitation.ts) — the single source of validation truth.
  const parsed = acceptInvitationSchema.safeParse({ displayName: input.displayName });
  if (!parsed.success) {
    return { ok: false, code: 'DISPLAY_NAME_REQUIRED' };
  }
  if (!input.token) return { ok: false, code: 'INVALID_INVITATION' };

  // Match the invitation by argon2id-verifying the raw token against
  // every recent pending invitation's tokenHash. For a small club this
  // is a few comparisons; at scale we'd add a fast hash prefix index.
  const argon2 = await import('argon2');
  const open = await db.query.invitations.findMany({
    where: eq(invitations.status, 'pending'),
  });
  let inv = null as null | (typeof open)[number];
  for (const candidate of open) {
    if (candidate.expiresAt.getTime() < Date.now()) continue;
    try {
      const ok = await argon2.verify(candidate.tokenHash, input.token);
      if (ok) {
        inv = candidate;
        break;
      }
    } catch {
      /* malformed hash, skip */
    }
  }
  if (!inv) return { ok: false, code: 'INVALID_INVITATION' };

  // Find or create Better Auth user.
  let user = await db.query.users.findFirst({ where: eq(users.email, inv.email) });
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: inv.email,
        name: input.displayName.trim(),
        emailVerified: true,
      })
      .returning();
    if (!created) throw new Error('Failed to create user');
    user = created;
  }

  // Find or create member.
  const existingMember = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
  });
  if (!existingMember) {
    await db.insert(members).values({
      clubId: inv.clubId,
      userId: user.id,
      email: inv.email,
      displayName: input.displayName.trim(),
      role: inv.role,
      acceptedInvitationAt: new Date(),
      createdByUserId: inv.createdByUserId,
    });
  }

  // Mark invitation accepted.
  await db
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: new Date(), acceptedByUserId: user.id })
    .where(eq(invitations.id, inv.id));

  // Trigger a magic-link send via Better Auth. The invitee gets a
  // normal sign-in email and lands on the home screen with the PIN
  // setup form.
  try {
    await auth.api.signInMagicLink({
      body: { email: inv.email },
      headers: await headers(),
    });
  } catch (err) {
    console.error('[accept-invitation] magic-link send failed', err);
  }

  return { ok: true, data: { email: inv.email } };
}

/**
 * Self-service resend for an expired (but still pending) invitation.
 * The invitee lands on /invitation/[token] with a dead link and taps
 * "send me a new one" — this re-matches that raw token, re-issues a
 * fresh token + 14-day expiry ON THE SAME invitation row, and re-emails
 * the ORIGINALLY-INVITED address.
 *
 * Security: the email only ever goes to inv.email (never an
 * attacker-supplied address), and holding the token already proves the
 * caller had access to the original invite, so there is no enumeration
 * leak. The rate limit is purely anti-spam. Accepted / revoked
 * invitations never match (status filter), so this can't resurrect a
 * consumed invite. User-reported 2026-06-04.
 */
export async function resendInvitationLinkAction(input: {
  token: string;
}): Promise<AuthActionResult<{ email: string }>> {
  if (!input.token) return { ok: false, code: 'INVALID_INVITATION' };

  // Match the raw token against every pending invitation — INCLUDING
  // expired ones. Expiry is a date, not a status change, so an expired
  // link is still status:'pending'; that's exactly the row we want to
  // refresh here (acceptInvitationAction skips them via an expiresAt
  // check; we deliberately do not).
  const argon2 = await import('argon2');
  const open = await db.query.invitations.findMany({
    where: eq(invitations.status, 'pending'),
  });
  let inv = null as null | (typeof open)[number];
  for (const candidate of open) {
    try {
      if (await argon2.verify(candidate.tokenHash, input.token)) {
        inv = candidate;
        break;
      }
    } catch {
      /* malformed hash, skip */
    }
  }
  if (!inv) return { ok: false, code: 'INVALID_INVITATION' };

  // Anti-spam rate limit keyed on the invited address + caller IP,
  // reusing the magic-link bucket (same "an email is about to be sent"
  // shape).
  const reqHeaders = await headers();
  const remoteIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    undefined;
  const { allowed } = await checkMagicLinkLimits(inv.email, remoteIp);
  if (!allowed) return { ok: false, code: 'RATE_LIMITED' };

  // Inviter name + club name for the email body. Both have graceful
  // fallbacks so a missing inviter member (e.g. since deactivated)
  // never blocks the resend.
  const [club, inviter] = await Promise.all([
    db.query.clubs.findFirst({ where: eq(clubs.id, inv.clubId) }),
    db.query.members.findFirst({
      where: and(
        eq(members.clubId, inv.clubId),
        eq(members.userId, inv.createdByUserId),
      ),
    }),
  ]);
  const clubName = club?.name ?? 'beeromat';

  // Re-issue: fresh token + expiry on the same row.
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = await argon2.hash(rawToken, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db
    .update(invitations)
    .set({ tokenHash, expiresAt })
    .where(eq(invitations.id, inv.id));

  const locale = (await getLocale().catch(() => undefined)) as Locale | undefined;
  try {
    const url = `${env.BETTER_AUTH_URL}/invitation/${rawToken}`;
    await sendInvitation({
      to: inv.email,
      inviterName: inviter?.displayName ?? clubName,
      clubName,
      url,
      locale,
    });
  } catch (err) {
    console.error('[resend-invitation] email dispatch failed', err);
    return { ok: false, code: 'EMAIL_SEND_FAILED' };
  }

  return { ok: true, data: { email: inv.email } };
}

export type MagicLinkStatus = 'sent' | 'not-on-allowlist' | 'rate-limited';

/**
 * Magic-link request entrypoint called by the sign-in form.
 * Per spec 006 contracts/auth.md (supersedes spec 001): returns a
 * 3-way status discriminator so the UI can distinguish on-list sends
 * from off-list submissions. Rate-limited / Turnstile-failed /
 * malformed-email all collapse into the `rate-limited` bucket — those
 * signals carry enumeration-adversary value and stay silent.
 */
export async function requestMagicLinkAction(input: {
  email: string;
  turnstileToken: string;
}): Promise<AuthActionResult<{ status: MagicLinkStatus }>> {
  const email = input.email.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    console.warn('[magic-link] invalid email submitted');
    return { ok: true, data: { status: 'rate-limited' } };
  }

  const reqHeaders = await headers();
  const remoteIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    undefined;

  const turnstileOk = await verifyTurnstileToken(input.turnstileToken, remoteIp);
  if (!turnstileOk) {
    console.warn('[magic-link] Turnstile verification failed');
    return { ok: true, data: { status: 'rate-limited' } };
  }

  const { allowed } = await checkMagicLinkLimits(email, remoteIp);
  if (!allowed) {
    console.warn('[magic-link] rate-limited', { email, remoteIp });
    return { ok: true, data: { status: 'rate-limited' } };
  }

  // Spec 008 FR-001 — bootstrap pre-create. When the users table is
  // empty (state A in data-model.md §2), the FIRST email to clear
  // Turnstile + rate-limit becomes the bootstrap candidate. We
  // pre-create the user row HERE (in a serialised transaction) so
  // Better Auth's verify can later create the session — Better Auth's
  // `disableSignUp: true` is intentional steady-state protection and
  // blocks user creation at verify time, so the user has to exist
  // before the link is clicked. The actual club_admin role grant
  // happens at verify time via the session.create.after hook in
  // lib/auth/better-auth.ts, NOT here — FR-003 requires a successful
  // round-trip before role assignment, and this branch only pre-creates
  // the user without any role.
  const bootstrapped = await db.transaction(async (tx) => {
    // Race safety: advisory lock keyed by the same constant as
    // promoteFirstUserIfNeeded in lib/auth/bootstrap.ts. Two
    // concurrent bootstrap pre-create attempts serialise — the
    // second sees the just-inserted user and returns false.
    // PostgreSQL rejects `count(*) FOR UPDATE` (aggregate + row-lock
    // incompatible), so we use pg_advisory_xact_lock instead.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1008)`);
    const result = await tx.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM "user"`,
    );
    const count = Number(result.rows[0]?.n ?? 0);
    if (count > 0) return false;
    await tx.insert(users).values({
      id: randomUUID(),
      email,
      name: email.split('@')[0] ?? email,
      emailVerified: false,
    });
    return true;
  });
  if (bootstrapped) {
    console.info('[magic-link] bootstrap pre-create', { email });
  }

  const member = await db.query.members.findFirst({
    where: eq(members.email, email),
  });
  const knownUser = member
    ? await db.query.users.findFirst({ where: eq(users.id, member.userId) })
    : null;
  const openInvitation = await db.query.invitations.findFirst({
    where: eq(invitations.email, email),
  });

  if (!bootstrapped && !knownUser && !openInvitation) {
    console.info('[magic-link] no matching member/invitation', { email });
    return { ok: true, data: { status: 'not-on-allowlist' } };
  }

  try {
    await auth.api.signInMagicLink({ body: { email }, headers: reqHeaders });
  } catch (err) {
    console.error('[magic-link] dispatch failed', err);
  }
  return { ok: true, data: { status: 'sent' } };
}

/**
 * Set or rotate the PIN for the current device.
 * - If a device_session exists (rotation): requires the current PIN.
 * - If no device_session exists (first set): no current PIN needed.
 */
export async function setPinAction(input: {
  pin: string;
  currentPin?: string;
  deviceLabel?: string;
}): Promise<AuthActionResult> {
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, code: 'INVALID_PIN_FORMAT' };
  }

  const ctx = await requireMember();
  const cookieStore = await cookies();
  const existingDeviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;

  if (existingDeviceId) {
    const existing = await db.query.deviceSessions.findFirst({
      where: eq(deviceSessions.id, existingDeviceId),
    });
    if (existing) {
      if (!input.currentPin) return { ok: false, code: 'CURRENT_PIN_REQUIRED' };
      const ok = await verifyPin(existing.pinHash, input.currentPin);
      if (!ok) return { ok: false, code: 'WRONG_CURRENT_PIN' };
      const newHash = await hashPin(input.pin);
      await db
        .update(deviceSessions)
        .set({
          pinHash: newHash,
          failedAttempts: 0,
          lockedUntil: null,
          lastUnlockAt: new Date(),
          deviceLabel: input.deviceLabel ?? existing.deviceLabel,
        })
        .where(eq(deviceSessions.id, existing.id));
      return { ok: true };
    }
  }

  // First-time setup on this device.
  const pinHash = await hashPin(input.pin);
  const newDeviceId = randomUUID();
  await db.insert(deviceSessions).values({
    id: newDeviceId,
    userId: ctx.user.id,
    clubId: ctx.club.id,
    deviceLabel: input.deviceLabel ?? null,
    pinHash,
    failedAttempts: 0,
    lastUnlockAt: new Date(),
  });
  cookieStore.set(DEVICE_ID_COOKIE, newDeviceId, deviceCookieOptions);
  return { ok: true };
}

/**
 * Verify the PIN entered by the user and unlock the device session.
 * On failure: increment failed_attempts; after MAX_PIN_ATTEMPTS, lock
 * the device session and force a fresh magic-link sign-in.
 */
export async function unlockDeviceAction(input: {
  pin: string;
}): Promise<AuthActionResult<{ attemptsRemaining?: number }>> {
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, code: 'INVALID_PIN_FORMAT' };
  }

  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  if (!deviceId) return { ok: false, code: 'NO_DEVICE_SESSION' };

  const ds = await db.query.deviceSessions.findFirst({
    where: eq(deviceSessions.id, deviceId),
  });
  if (!ds) return { ok: false, code: 'NO_DEVICE_SESSION' };

  if (ds.lockedUntil && ds.lockedUntil > new Date()) {
    return { ok: false, code: 'LOCKED' };
  }

  const isMatch = await verifyPin(ds.pinHash, input.pin);
  if (isMatch) {
    await db
      .update(deviceSessions)
      .set({ failedAttempts: 0, lastUnlockAt: new Date() })
      .where(eq(deviceSessions.id, ds.id));
    return { ok: true };
  }

  const newFailedAttempts = ds.failedAttempts + 1;
  if (newFailedAttempts >= MAX_PIN_ATTEMPTS) {
    await db
      .update(deviceSessions)
      .set({
        failedAttempts: newFailedAttempts,
        lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
      })
      .where(eq(deviceSessions.id, ds.id));
    // Invalidate the Better Auth session — force a fresh magic link.
    await auth.api.signOut({ headers: new Headers() }).catch(() => {});
    return { ok: false, code: 'LOCKED' };
  }
  await db
    .update(deviceSessions)
    .set({ failedAttempts: newFailedAttempts })
    .where(eq(deviceSessions.id, ds.id));
  return {
    ok: false,
    code: 'WRONG_PIN',
    attemptsRemaining: MAX_PIN_ATTEMPTS - newFailedAttempts,
  };
}

/** Sign out this device — invalidate Better Auth session AND drop the
 *  device_sessions row + device_id cookie. */
export async function signOutDeviceAction(): Promise<AuthActionResult> {
  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  if (deviceId) {
    await db.delete(deviceSessions).where(eq(deviceSessions.id, deviceId));
    cookieStore.delete(DEVICE_ID_COOKIE);
  }
  // Best-effort sign-out from Better Auth.
  try {
    await auth.api.signOut({ headers: new Headers() });
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/** Sign out from EVERY device — drops every device_sessions row for
 *  the current user (forcing a fresh magic-link sign-in on each one
 *  next time it tries to unlock), then signs out the current session
 *  + cookie too. "Panic button" variant of signOutDeviceAction. */
export async function signOutAllDevicesAction(): Promise<AuthActionResult> {
  const ctx = await requireMember();
  await db.delete(deviceSessions).where(eq(deviceSessions.userId, ctx.user.id));
  const cookieStore = await cookies();
  cookieStore.delete(DEVICE_ID_COOKIE);
  try {
    await auth.api.signOut({ headers: new Headers() });
  } catch {
    /* ignore */
  }
  return { ok: true };
}
