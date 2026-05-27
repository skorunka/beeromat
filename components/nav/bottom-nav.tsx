'use client';

import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Clock, Dices, Home, Plus, Receipt, Shield, Trophy, User } from 'lucide-react';

import { Link, usePathname } from '@/lib/i18n/navigation';

// Persistent bottom navigation for the daily member flows (US7).
// The role-gated operational entry (treasurer/stock/admin) is decided
// server-side in the (app) layout and passed in — this component never
// touches the session.

export type NavKey =
  | 'home'
  | 'log'
  | 'tab'
  | 'bet'
  | 'match'
  | 'history'
  | 'account'
  | 'treasurer'
  | 'stock'
  | 'admin';

const ICONS: Record<NavKey, typeof Home> = {
  home: Home,
  log: Plus,
  tab: Receipt,
  bet: Dices,
  match: Trophy,
  history: Clock,
  account: User,
  treasurer: Shield,
  stock: Shield,
  admin: Shield,
};

export interface NavItem {
  key: NavKey;
  href: Route;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  // next-intl's usePathname returns the path without the locale prefix.
  const path = usePathname();

  return (
    <nav
      aria-label={t('home')}
      className="bg-card fixed inset-x-0 bottom-0 z-40 flex border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const href = String(item.href);
        const active =
          href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors ${
              active ? 'text-primary font-semibold' : 'text-muted-foreground'
            }`}
          >
            {/* Active tab carries a short honey-amber bar at the top edge. */}
            {active && (
              <span
                aria-hidden
                className="bg-primary absolute inset-x-5 top-0 h-0.5 rounded-full"
              />
            )}
            <Icon className="size-5" aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
