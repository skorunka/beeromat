import type { Route } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth/better-auth';
import { currentSession } from '@/lib/auth/session';
import { deviceSessionState } from '@/lib/auth/device-session-state';
import { getDisputedClaimsForMember } from '@/lib/db/queries/payments';
import { formatMoney } from '@/lib/format';
import { roleSatisfies } from '@/lib/permissions';
import { PinGate } from '@/components/pin/pin-gate';
import { DisputeBanner } from '@/components/dispute-banner';
import { BottomNav, type NavItem } from '@/components/nav/bottom-nav';

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

  const disputed = await getDisputedClaimsForMember(ctx.member.id);

  // Daily destinations for everyone, plus one role-gated operational
  // entry (highest role wins) — computed server-side so the client nav
  // never sees the session (US7, FR-013).
  const navItems: NavItem[] = [
    { key: 'home', href: '/' as Route },
    { key: 'log', href: '/log' as Route },
    { key: 'tab', href: '/tab' as Route },
    { key: 'bet', href: '/bet' as Route },
    { key: 'history', href: '/history' as Route },
  ];
  if (roleSatisfies(ctx.member.role, 'club_admin')) {
    navItems.push({ key: 'admin', href: '/admin' as Route });
  } else if (roleSatisfies(ctx.member.role, 'treasurer')) {
    navItems.push({ key: 'treasurer', href: '/admin/pending' as Route });
  } else if (roleSatisfies(ctx.member.role, 'stock_manager')) {
    navItems.push({ key: 'stock', href: '/admin/beer-types' as Route });
  }

  return (
    <>
      {disputed.length > 0 ? (
        <DisputeBanner
          claims={disputed.map((d) => ({
            paymentId: d.paymentId,
            amountDisplay: formatMoney(d.amountMinor, d.currencyCode, ctx.club.defaultLocale),
            reason: d.reason,
          }))}
        />
      ) : null}
      {/* Bottom padding clears the fixed nav so it never occludes content. */}
      <div className="pb-20">{children}</div>
      <BottomNav items={navItems} />
    </>
  );
}
