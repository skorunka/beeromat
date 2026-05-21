import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';

// US7 — the single Admin hub: one tap to every operational area.
export default async function AdminHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireRole('club_admin');
  const t = await getTranslations('admin');
  const tTreasurer = await getTranslations('treasurer');

  const links: { href: Route; title: string; desc: string }[] = [
    { href: '/admin/members' as Route, title: t('members'), desc: t('membersDesc') },
    {
      href: '/admin/settings/banking' as Route,
      title: t('banking'),
      desc: t('bankingDesc'),
    },
    { href: '/admin/beer-types' as Route, title: t('beerTypes'), desc: t('beerTypesDesc') },
    {
      href: '/admin/pending' as Route,
      title: tTreasurer('pendingTitle'),
      desc: t('pendingDesc'),
    },
    {
      href: '/admin/balances' as Route,
      title: tTreasurer('balancesTitle'),
      desc: t('balancesDesc'),
    },
  ];

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-xl font-semibold">{t('hubTitle')}</h1>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>
              <Card className="hover:bg-accent p-4 transition-colors">
                <div className="font-medium">{l.title}</div>
                <div className="text-muted-foreground text-sm">{l.desc}</div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
