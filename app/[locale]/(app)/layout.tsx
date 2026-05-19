import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth/better-auth';
import { currentSession } from '@/lib/auth/session';
import { deviceSessionState } from '@/lib/auth/device-session-state';
import { PinGate } from '@/components/pin/pin-gate';

// Authenticated route group layout. Gates everything under (app)/* behind
// (a) a valid Better Auth session and (b) the device PIN.
//
// Unauthenticated users are redirected to /sign-in (rather than throwing
// unauthorized()) so the UX is a clean redirect with no 401 page.
//
// State machine (see lib/auth/device-session-state.ts):
//   no-session → render PIN setup form
//   locked     → render PIN unlock form (which shows the locked message)
//   stale      → render PIN unlock form
//   unlocked   → render children
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  // Cheap session probe first — avoid the deeper query if there's no
  // Better Auth session.
  const raw = await auth.api.getSession({ headers: await headers() });
  if (!raw?.user) redirect('/sign-in');

  const ctx = await currentSession();
  if (!ctx) redirect('/sign-in');

  const state = deviceSessionState(ctx.deviceSession, ctx.club.deviceInactivityLockSeconds);

  if (state === 'no-session') return <PinGate mode="setup" />;
  if (state !== 'unlocked') return <PinGate mode="unlock" />;
  return <>{children}</>;
}
