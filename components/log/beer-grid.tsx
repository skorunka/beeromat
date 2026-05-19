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
        toast.success(`+ ${beer.name}`);
      } else if (result.code === 'OUT_OF_STOCK') {
        toast.error('Out of stock');
      } else {
        toast.error(t('common.error'));
      }
    });
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
                <Badge variant="secondary">Low</Badge>
              ) : null}
              {beer.isOutOfStock ? <Badge variant="destructive">0</Badge> : null}
            </div>
            <div className="text-muted-foreground text-sm">
              {formatMoney(beer.unitPriceMinor, currencyCode, locale)}
              {' · '}
              {beer.currentStock} left
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}
