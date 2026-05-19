'use server';

import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { invitations, members, deviceSessions } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';
import { requireMember } from '@/lib/auth/session';
import { DEVICE_ID_COOKIE } from '@/lib/auth/session';
import { hashPin, isValidPinFormat, verifyPin } from '@/lib/auth/pin';
import { auth } from '@/lib/auth/better-auth';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';
import {
  magicLinkPerEmailLimiter,
  magicLinkPerIpLimiter,
} from '@/lib/rate-limit';

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
  if (!input.displayName || input.displayName.trim().length === 0) {
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
 * Magic-link request entrypoint called by the sign-in form.
 * Per contracts/auth.md: always returns { ok: true } to the client to
 * prevent email-enumeration. All failures (rate-limit, Turnstile, no
 * matching invitation/member) are logged server-side and silently
 * absorbed.
 */
export async function requestMagicLinkAction(input: {
  email: string;
  turnstileToken: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    console.warn('[magic-link] invalid email submitted');
    return { ok: true };
  }

  // 1. Turnstile.
  const reqHeaders = await headers();
  const remoteIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    undefined;
  const turnstileOk = await verifyTurnstileToken(input.turnstileToken, remoteIp);
  if (!turnstileOk) {
    console.warn('[magic-link] Turnstile verification failed');
    return { ok: true };
  }

  // 2. Rate-limit per email + IP.
  const perEmail = await magicLinkPerEmailLimiter().limit(`email:${email}`);
  if (!perEmail.success) {
    console.warn('[magic-link] rate-limited by email', { email });
    return { ok: true };
  }
  if (remoteIp) {
    const perIp = await magicLinkPerIpLimiter().limit(`ip:${remoteIp}`);
    if (!perIp.success) {
      console.warn('[magic-link] rate-limited by IP', { remoteIp });
      return { ok: true };
    }
  }

  // 3. Only send if the email is either an active member OR an open
  //    invitation. Unknown emails get no email but the same response.
  const member = await db.query.members.findFirst({
    where: eq(members.email, email),
  });
  const knownUser = member
    ? await db.query.users.findFirst({ where: eq(users.id, member.userId) })
    : null;
  const openInvitation = await db.query.invitations.findFirst({
    where: eq(invitations.email, email),
  });

  if (!knownUser && !openInvitation) {
    console.info('[magic-link] no matching member/invitation', { email });
    return { ok: true };
  }

  // 4. Dispatch.
  try {
    await auth.api.signInMagicLink({ body: { email }, headers: reqHeaders });
  } catch (err) {
    console.error('[magic-link] dispatch failed', err);
  }
  return { ok: true };
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
