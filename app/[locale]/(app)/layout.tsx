import type { Route } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth/better-auth';
import { currentSession, localeRedirect } from '@/lib/auth/session';
import { deviceSessionState } from '@/lib/auth/device-session-state';
import { memberBalance } from '@/lib/balance/calculate';
import { getDisputedClaimsForMember } from '@/lib/db/queries/payments';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { roleSatisfies } from '@/lib/permissions';
import { PinGate } from '@/components/pin/pin-gate';
import { DisputeBanner } from '@/components/dispute-banner';
import { AppHeader } from '@/components/nav/app-header';
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
  if (!raw?.user) return localeRedirect('/sign-in');

  const ctx = await currentSession();
  if (!ctx) return localeRedirect('/sign-in');

  const state = deviceSessionState(ctx.deviceSession, ctx.club.deviceInactivityLockSeconds);

  if (state === 'no-session') return <PinGate mode="setup" />;
  if (state !== 'unlocked') return <PinGate mode="unlock" />;

  const [disputed, balanceMinor, tHome] = await Promise.all([
    getDisputedClaimsForMember(ctx.member.id),
    memberBalance(ctx.member.id),
    getTranslations('home'),
  ]);
  // Compact format for the header pill ("380 Kč" not "380,00 Kč").
  // The aria-label uses the full sentence form for screen readers,
  // built from the catalog with the precise amount.
  const balanceFormatted =
    balanceMinor > 0n
      ? formatMoneyCompact(balanceMinor, ctx.club.currencyCode, ctx.club.defaultLocale)
      : null;
  const balanceAriaLabel =
    balanceFormatted !== null
      ? tHome('balanceOwed', {
          amount: formatMoney(balanceMinor, ctx.club.currencyCode, ctx.club.defaultLocale),
        })
      : tHome('balanceSquare');

  // Daily destinations for everyone, plus one role-gated operational
  // entry (highest role wins) — computed server-side so the client nav
  // never sees the session (US7, FR-013).
  //
  // Spec 017/018/balance-badge follow-up — Log + Tab dropped from
  // bottom nav. Home covers both surfaces now (one-tap log button
  // and the friendly balance sentence) and the balance pill in
  // AppHeader provides the secondary route to /tab. /log + /tab
  // remain reachable as deep links and via the "Vyber jiné pivo →"
  // home link.
  const navItems: NavItem[] = [
    { key: 'home', href: '/' as Route },
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
      <AppHeader
        clubName={ctx.club.name}
        displayName={ctx.member.displayName}
        email={ctx.user.email}
        avatarKey={ctx.member.avatarKey ?? null}
        balanceFormatted={balanceFormatted}
        balanceAriaLabel={balanceAriaLabel}
      />
      {/* Bottom padding clears the fixed nav so it never occludes content. */}
      <div className="pb-20">{children}</div>
      <BottomNav items={navItems} />
    </>
  );
}
