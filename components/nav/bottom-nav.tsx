'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, Dices, Home, Plus, Receipt, Shield } from 'lucide-react';

// Persistent bottom navigation for the daily member flows (US7).
// The role-gated operational entry (treasurer/stock/admin) is decided
// server-side in the (app) layout and passed in — this component never
// touches the session.

export type NavKey = 'home' | 'log' | 'tab' | 'bet' | 'history' | 'treasurer' | 'stock' | 'admin';

const ICONS: Record<NavKey, typeof Home> = {
  home: Home,
  log: Plus,
  tab: Receipt,
  bet: Dices,
  history: Clock,
  treasurer: Shield,
  stock: Shield,
  admin: Shield,
};

export interface NavItem {
  key: NavKey;
  href: Route;
}

/** Strip the leading /cs or /en locale segment for active-state matching. */
function localelessPath(pathname: string): string {
  const stripped = pathname.replace(/^\/(cs|en)(?=\/|$)/, '');
  return stripped === '' ? '/' : stripped;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const path = localelessPath(usePathname());

  return (
    <nav
      aria-label={t('home')}
      className="bg-background fixed inset-x-0 bottom-0 z-40 flex border-t"
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
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
              active ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
          >
            <Icon className="size-5" aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
