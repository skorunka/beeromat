'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { logBeerAction } from '@/app/[locale]/(app)/log/actions';
import { formatMoney } from '@/lib/format';

interface BeerTile {
  id: string;
  name: string;
  unitPriceMinor: bigint;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

interface BeerGridProps {
  beers: BeerTile[];
  currencyCode: string;
  locale: string;
}

export function BeerGrid({ beers, currencyCode, locale }: BeerGridProps) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  function handleLog(beer: BeerTile) {
    if (beer.isOutOfStock || isPending) return;
    startTransition(async () => {
      const result = await logBeerAction({ beerTypeId: beer.id });
      if (result.ok) {
        toast.success(t('log.added', { name: beer.name }));
      } else if (result.code === 'OUT_OF_STOCK') {
        toast.error(t('log.outOfStock'));
      } else {
        toast.error(t('common.error'));
      }
    });
  }

  // A friendly empty state when the club has no beer types yet — rather
  // than a bleak empty grid (v1.3 UX review F16).
  if (beers.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">{t('log.empty')}</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {beers.map((beer) => (
        <button
          key={beer.id}
          type="button"
          disabled={beer.isOutOfStock || isPending}
          onClick={() => handleLog(beer)}
          className="text-left disabled:opacity-50"
        >
          <Card className="hover:bg-accent flex h-32 flex-col justify-between p-4 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-base font-semibold">{beer.name}</span>
              {beer.isLowStock && !beer.isOutOfStock ? (
                <Badge variant="secondary">{t('log.lowBadge')}</Badge>
              ) : null}
              {beer.isOutOfStock ? <Badge variant="destructive">{t('log.outBadge')}</Badge> : null}
            </div>
            <div className="text-muted-foreground text-sm">
              {formatMoney(beer.unitPriceMinor, currencyCode, locale)}
              {' · '}
              {t('log.left', { count: beer.currentStock })}
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}
