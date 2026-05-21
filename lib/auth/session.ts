import 'server-only';
import { cookies, headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';

// Locale-aware redirect — preserves the active locale prefix, so an
// /en/* visitor hitting an auth guard lands on /en/sign-in rather than
// the default-locale sign-in.
import { redirect } from '@/lib/i18n/navigation';

// Locale-less redirect targets; localeRedirect prepends the active locale.
const SIGN_IN = '/sign-in';
const APP_HOME = '/';

import { db } from '@/lib/db/client';
import { clubs, type Club } from '@/lib/db/schema/clubs';
import { deviceSessions, members, type DeviceSession, type Member } from '@/lib/db/schema/members';
import { type Role, roleSatisfies } from '@/lib/permissions';

import { auth } from './better-auth';

export const DEVICE_ID_COOKIE = 'device_id';

export interface SessionContext {
  user: { id: string; email: string; name: string };
  member: Member;
  club: Club;
  deviceSession: DeviceSession | null;
}

/**
 * Resolve the current request's full session context. Returns null if no
 * Better Auth session is present. The device session is null when the
 * user has authenticated via magic link but not yet set / unlocked a
 * device PIN on this device.
 */
export async function currentSession(): Promise<SessionContext | null> {
  const rawSession = await auth.api.getSession({ headers: await headers() });
  if (!rawSession?.user) return null;

  // v1 single-club: exactly one members row per user.
  const memberRow = await db.query.members.findFirst({
    where: eq(members.userId, rawSession.user.id),
  });
  if (!memberRow || !memberRow.isActive) return null;

  const clubRow = await db.query.clubs.findFirst({
    where: eq(clubs.id, memberRow.clubId),
  });
  if (!clubRow) return null;

  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  let deviceSession: DeviceSession | null = null;
  if (deviceId) {
    deviceSession =
      (await db.query.deviceSessions.findFirst({
        where: eq(deviceSessions.id, deviceId),
      })) ?? null;
  }

  return {
    user: {
      id: rawSession.user.id,
      email: rawSession.user.email,
      name: rawSession.user.name,
    },
    member: memberRow,
    club: clubRow,
    deviceSession,
  };
}

// Auth guards use the stable `redirect()` primitive rather than Next's
// experimental `unauthorized()` / `forbidden()` interrupts (which need
// `experimental.authInterrupts` and throw without it). `redirect()`
// works identically in Server Components and Server Actions.

/**
 * Locale-aware redirect, typed `never`. next-intl's redirect() is not
 * typed `never`, so callers would lose control-flow narrowing; this
 * wrapper always terminates (redirect throws — the throw is a
 * belt-and-braces guard) so `if (!x) return localeRedirect(...)` narrows.
 */
export async function localeRedirect(href: string): Promise<never> {
  redirect({ href, locale: await getLocale() });
  throw new Error('localeRedirect: redirect() did not throw');
}

/**
 * Resolve the session context or redirect to /sign-in. The first line
 * of every protected Server Component and Server Action.
 */
export async function requireMember(): Promise<SessionContext> {
  const ctx = await currentSession();
  if (!ctx) return localeRedirect(SIGN_IN);
  return ctx;
}

/**
 * `requireMember()` + role check (club_admin satisfies every role).
 * On insufficient role, redirects to the app home rather than exposing
 * the resource.
 */
export async function requireRole(...allowed: Role[]): Promise<SessionContext> {
  const ctx = await requireMember();
  const ok = allowed.some((required) => roleSatisfies(ctx.member.role, required));
  if (!ok) return localeRedirect(APP_HOME);
  return ctx;
}

/**
 * `requireMember()` + a check that the device PIN is unlocked (and not
 * locked out). On a locked/stale device, redirects to the app home —
 * the (app) layout renders the PIN gate there.
 */
export async function requireUnlocked(): Promise<SessionContext> {
  const ctx = await requireMember();
  const ds = ctx.deviceSession;
  if (!ds) return localeRedirect(APP_HOME); // No PIN on this device → setup gate.
  if (ds.lockedUntil && ds.lockedUntil > new Date()) return localeRedirect(APP_HOME);

  const inactivityWindowMs = ctx.club.deviceInactivityLockSeconds * 1000;
  if (!ds.lastUnlockAt || Date.now() - ds.lastUnlockAt.getTime() > inactivityWindowMs) {
    return localeRedirect(APP_HOME); // Inactivity window exceeded → re-prompt.
  }
  return ctx;
}
