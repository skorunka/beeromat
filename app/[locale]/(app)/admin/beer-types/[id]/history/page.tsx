import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { beerTypes } from '@/lib/db/schema/catalog';
import type { StockChange } from '@/lib/db/schema/catalog';
import { getStockHistory } from '@/lib/db/queries/stock';

export default async function StockHistoryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('stock_manager', 'club_admin');
  const t = await getTranslations('admin');
  const beer = await db.query.beerTypes.findFirst({
    where: and(eq(beerTypes.id, id), eq(beerTypes.clubId, ctx.club.id)),
  });
  if (!beer) notFound();

  const kindLabel: Record<StockChange['kind'], string> = {
    restock: t('kindRestock'),
    adjustment: t('kindAdjustment'),
    consumption_decrement: t('kindConsumption'),
    consumption_void_increment: t('kindConsumptionVoid'),
  };

  const history = await getStockHistory({ clubId: ctx.club.id, beerTypeId: id });
  const dateFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link
        href={'/admin/beer-types' as Route}
        className="text-primary text-sm underline"
      >
        ← {t('beerTypesBack')}
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">
        {t('stockHistoryTitle', { name: beer.name })}
      </h1>

      <ul className="flex flex-col gap-2">
        {history.map((row) => (
          <li key={row.id}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-medium">{kindLabel[row.kind] ?? row.kind}</div>
                <div className="text-muted-foreground text-xs">
                  {dateFmt.format(row.createdAt)} · {row.createdByDisplayName}
                  {row.reason ? ` · ${row.reason}` : ''}
                </div>
              </div>
              <div
                className={`font-mono text-sm font-semibold ${
                  row.delta >= 0 ? 'text-primary' : 'text-destructive'
                }`}
              >
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </div>
            </Card>
          </li>
        ))}
        {history.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center text-sm">
            {t('noStockChanges')}
          </li>
        ) : null}
      </ul>
    </main>
  );
}
