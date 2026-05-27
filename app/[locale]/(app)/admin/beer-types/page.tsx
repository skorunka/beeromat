import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BeerTypeManager, type BeerTypeManagerView } from '@/components/admin/beer-type-manager';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { getBeerTypeCatalog, getClubMarginSummary } from '@/lib/db/queries/catalog';
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
  const marginSummary = await getClubMarginSummary(ctx.club.id);
  const { currencyCode, defaultLocale } = ctx.club;

  const view: BeerTypeManagerView[] = beers.map((b) => ({
    id: b.id,
    name: b.name,
    unitPriceMinor: b.unitPriceMinor.toString(),
    priceDisplay: formatMoney(b.unitPriceMinor, currencyCode, defaultLocale),
    buyPriceMinor: b.buyPriceMinor === null ? null : b.buyPriceMinor.toString(),
    buyPriceDisplay:
      b.buyPriceMinor === null ? null : formatMoney(b.buyPriceMinor, currencyCode, defaultLocale),
    marginPerUnitDisplay:
      b.buyPriceMinor === null
        ? null
        : formatMoney(b.unitPriceMinor - b.buyPriceMinor, currencyCode, defaultLocale),
    currentStock: b.currentStock,
    lowStockThreshold: b.lowStockThreshold,
    isLowStock: b.isLowStock,
    isOutOfStock: b.isOutOfStock,
    isArchived: b.isArchived,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('beerTypesTitle')}</h1>
        <Link
          href={'/admin' as Route}
          className="text-muted-foreground hover:text-foreground text-sm underline"
        >
          ← {tCommon('back')}
        </Link>
      </header>
      {/* Spec 011 — club margin summary. */}
      <Card className="mb-4 p-4">
        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t('clubMarginTitle')}
        </div>
        <div className="text-foreground text-2xl font-extrabold tabular-nums">
          {formatMoney(marginSummary.totalMarginMinor, currencyCode, defaultLocale)}
        </div>
        {marginSummary.untrackedBeerCount > 0 ? (
          <div className="text-muted-foreground mt-1 text-xs">
            {t('clubMarginUntrackedNote', { count: marginSummary.untrackedBeerCount })}
          </div>
        ) : null}
      </Card>
      <BeerTypeManager beerTypes={view} currencyCode={currencyCode} />
    </main>
  );
}
