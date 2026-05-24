import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BeerTypeManager, type BeerTypeManagerView } from '@/components/admin/beer-type-manager';
import { requireRole } from '@/lib/auth/session';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { formatMoney } from '@/lib/format';

// US7 — stock manager's beer-type catalog (includes archived types).
export default async function BeerTypesAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('stock_manager', 'club_admin');
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const beers = await getBeerTypeCatalog(ctx.club.id, { includeArchived: true });
  const { currencyCode, defaultLocale } = ctx.club;

  const view: BeerTypeManagerView[] = beers.map((b) => ({
    id: b.id,
    name: b.name,
    unitPriceMinor: b.unitPriceMinor.toString(),
    priceDisplay: formatMoney(b.unitPriceMinor, currencyCode, defaultLocale),
    currentStock: b.currentStock,
    lowStockThreshold: b.lowStockThreshold,
    isLowStock: b.isLowStock,
    isOutOfStock: b.isOutOfStock,
    isArchived: b.isArchived,
  }));

  return (
    <main className="mx-auto max-w-2xl p-5">
      <Link
        href={'/admin' as Route}
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm underline"
      >
        ← {tCommon('back')}
      </Link>
      <h1 className="mb-4 text-2xl font-bold">{t('beerTypesTitle')}</h1>
      <BeerTypeManager beerTypes={view} currencyCode={currencyCode} />
    </main>
  );
}
