import 'server-only';
import { cookies, headers } from 'next/headers';
import { forbidden, unauthorized } from 'next/navigation';
import { eq } from 'drizzle-orm';

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

/**
 * Throws `unauthorized()` (renders the unauthorized.tsx UI / returns 401)
 * if there's no authenticated active member. Use as the first line of
 * every protected Server Action and Server Component.
 */
export async function requireMember(): Promise<SessionContext> {
  const ctx = await currentSession();
  if (!ctx) unauthorized();
  return ctx;
}

/**
 * `requireMember()` + role check. Allows roles by hierarchy (club_admin
 * satisfies every role).
 */
export async function requireRole(...allowed: Role[]): Promise<SessionContext> {
  const ctx = await requireMember();
  const ok = allowed.some((required) => roleSatisfies(ctx.member.role, required));
  if (!ok) forbidden();
  return ctx;
}

/**
 * `requireMember()` + a check that the device PIN is unlocked (and not
 * locked out from brute-force attempts). Used on protected pages /
 * actions that demand the second factor.
 */
export async function requireUnlocked(): Promise<SessionContext> {
  const ctx = await requireMember();
  const ds = ctx.deviceSession;
  if (!ds) forbidden(); // No PIN set for this device → force PIN setup.
  if (ds.lockedUntil && ds.lockedUntil > new Date()) forbidden();

  const inactivityWindowMs = ctx.club.deviceInactivityLockSeconds * 1000;
  if (
    !ds.lastUnlockAt ||
    Date.now() - ds.lastUnlockAt.getTime() > inactivityWindowMs
  ) {
    forbidden(); // Inactivity window exceeded → re-prompt for PIN.
  }
  return ctx;
}
