import { setRequestLocale } from 'next-intl/server';

import { BeerGrid } from '@/components/log/beer-grid';
import { requireUnlocked } from '@/lib/auth/session';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';

export default async function LogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const beers = await getBeerTypeCatalog(ctx.club.id);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Log a beer</h1>
      <BeerGrid
        beers={beers}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.member.role === 'club_admin' ? 'en' : ctx.club.defaultLocale}
      />
    </main>
  );
}
