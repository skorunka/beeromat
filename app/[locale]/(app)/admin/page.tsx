import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { countPendingClaims } from '@/lib/db/queries/payments';

// US7 — the single Admin hub: one tap to every operational area.
export default async function AdminHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('club_admin');
  const t = await getTranslations('admin');
  const tTreasurer = await getTranslations('treasurer');
  const pendingCount = await countPendingClaims(ctx.club.id);

  // Ordered most-used first: confirming payments + stock + balances are
  // the recurring ops; member management is occasional; club setup is a
  // one-/twice-ever thing, so it sinks to the bottom.
  const links: { href: Route; title: string; desc: string; badge?: number }[] = [
    {
      href: '/admin/pending' as Route,
      title: tTreasurer('pendingTitle'),
      desc: t('pendingDesc'),
      badge: pendingCount,
    },
    { href: '/admin/beer-types' as Route, title: t('beerTypes'), desc: t('beerTypesDesc') },
    {
      href: '/admin/balances' as Route,
      title: tTreasurer('balancesTitle'),
      desc: t('balancesDesc'),
    },
    { href: '/admin/members' as Route, title: t('members'), desc: t('membersDesc') },
    {
      href: '/admin/config' as Route,
      title: t('config'),
      desc: t('configDesc'),
    },
  ];

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 text-2xl font-bold">{t('hubTitle')}</h1>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>
              <Card className="hover:bg-accent p-4 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.title}</span>
                  {l.badge ? <Badge>{l.badge}</Badge> : null}
                </div>
                <div className="text-muted-foreground text-sm">{l.desc}</div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
