import type { DeviceSession } from '@/lib/db/schema/members';

export type DeviceSessionState = 'no-session' | 'locked' | 'stale' | 'unlocked';

/**
 * Pure helper (lives in a .ts file outside any React component) so the
 * react-hooks/purity rule doesn't flag the necessary Date.now() check.
 * Called from the (app)/layout server component to decide whether to
 * render the PIN gate.
 */
export function deviceSessionState(
  ds: DeviceSession | null | undefined,
  inactivityLockSeconds: number,
  now: number = Date.now(),
): DeviceSessionState {
  if (!ds) return 'no-session';
  if (ds.lockedUntil && ds.lockedUntil.getTime() > now) return 'locked';
  const inactivityMs = inactivityLockSeconds * 1000;
  if (!ds.lastUnlockAt || now - ds.lastUnlockAt.getTime() > inactivityMs) {
    return 'stale';
  }
  return 'unlocked';
}
