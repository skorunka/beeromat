'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Beer, ChevronDown } from 'lucide-react';

import { logBeerAction } from '@/app/[locale]/(app)/log/actions';
import { celebrateBeer } from '@/lib/celebrate';
import { BeerSpinner } from '@/components/ui/beer-spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec 017 + 2026-05-27 refinement — home one-tap log is now a
// split button:
//   • Main tap   → logs the default beer (member's last pick).
//   • Chevron tap → opens a dropdown with every OTHER in-stock beer
//                   from the catalog; tapping any item logs it.
// The standalone "Vyber jiné pivo →" link is gone — its job moved
// into the chevron dropdown.
//
// Variants:
//   • Default beer valid + in stock → split button (main + chevron)
//   • Default beer null / archived / out of stock → whole button
//     opens the dropdown directly; no separate split. If the catalog
//     is also empty, the button shows a disabled empty-state.

export interface HomeOneTapLogBeer {
  id: string;
  name: string;
  currentStock: number;
  isArchived: boolean;
  unitPriceMinor: bigint;
}

interface HomeOneTapLogProps {
  beer: HomeOneTapLogBeer | null;
  /** Every in-stock, non-archived beer in the club's catalog, ordered
   *  by display order. Includes the default beer if it qualifies —
   *  the component filters it out so the dropdown only shows the
   *  "others." */
  catalog: HomeOneTapLogBeer[];
  currencyCode: string;
  locale: string;
}

export function HomeOneTapLog({
  beer,
  catalog,
  currencyCode,
  locale,
}: HomeOneTapLogProps) {
  const t = useTranslations('home');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const defaultUsable =
    beer !== null && !beer.isArchived && beer.currentStock > 0;
  const otherBeers = catalog.filter((b) => b.id !== beer?.id);

  function logBeer(b: HomeOneTapLogBeer) {
    startTransition(async () => {
      const result = await logBeerAction({ beerTypeId: b.id });
      if (result.ok) {
        celebrateBeer();
        toast.success(
          t('toastLogged', {
            balance: formatMoney(result.balanceAfterMinor, currencyCode, locale),
          }),
        );
        router.refresh();
      } else if (result.code === 'OUT_OF_STOCK') {
        toast.error(t('toastError'));
      } else {
        toast.error(t('toastError'));
      }
    });
  }

  // Empty catalog edge: nothing to log + nothing to pick. Disabled
  // empty-state button so the home surface stays visually anchored.
  if (catalog.length === 0) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="bg-primary text-primary-foreground inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold opacity-50"
      >
        <Beer className="h-5 w-5" aria-hidden />
        {t('oneTapLogGeneric')}
      </button>
    );
  }

  // Default-usable case: split button. Main button logs the default;
  // chevron opens the dropdown of other beers.
  if (defaultUsable && beer) {
    const mainLabel = t('oneTapLog', {
      beer: beer.name,
      price: formatMoneyCompact(beer.unitPriceMinor, currencyCode, locale),
    });
    return (
      <div className="bg-primary text-primary-foreground flex h-14 w-full overflow-hidden rounded-lg shadow-sm">
        <button
          type="button"
          onClick={() => logBeer(beer)}
          disabled={isPending}
          aria-busy={isPending ? 'true' : undefined}
          className="hover:bg-primary/90 disabled:opacity-60 flex flex-1 items-center justify-center gap-2 text-base font-semibold transition-colors"
        >
          {isPending ? (
            <BeerSpinner className="h-5 w-5" label="" />
          ) : (
            <Beer className="h-5 w-5" aria-hidden />
          )}
          {mainLabel}
        </button>

        {otherBeers.length > 0 ? (
          <>
            <span aria-hidden className="bg-primary-foreground/25 w-px shrink-0" />
            {/*
              Spec 026 — INTENTIONAL design choice: the home one-tap
              "pick another" affordance is a DropdownMenu (not a
              beer-tile grid like /log or /log/for). Home is
              vertically constrained — between the AppHeader, the
              balance pill, and the bet awareness card, there's no
              room for a tile grid without pushing critical content
              below the fold on a 360-wide phone. The dropdown
              keeps the home button compact while still exposing
              the full catalog one tap away. Documented so a future
              fresh-eyes audit doesn't re-flag this as off-pattern.
            */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('pickAnother')}
                disabled={isPending}
                className="hover:bg-primary/90 disabled:opacity-60 flex w-12 shrink-0 items-center justify-center transition-colors"
              >
                <ChevronDown className="h-5 w-5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
                {otherBeers.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => logBeer(b)}>
                    <Beer aria-hidden />
                    <span className="flex-1 truncate">{b.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatMoneyCompact(b.unitPriceMinor, currencyCode, locale)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    );
  }

  // No usable default (null / archived / out of stock). The whole
  // button opens the dropdown; the dropdown lists everything in
  // stock. Out-of-stock default shows its name with a "nedostupné"
  // hint as the trigger label so the member knows their usual is
  // unavailable.
  const triggerLabel =
    beer && beer.currentStock <= 0 && !beer.isArchived
      ? t('oneTapLogUnavailable', { beer: beer.name })
      : t('oneTapLogGeneric');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold shadow-sm transition-colors"
      >
        {isPending ? (
          <BeerSpinner className="h-5 w-5" label="" />
        ) : (
          <Beer className="h-5 w-5" aria-hidden />
        )}
        {triggerLabel}
        <ChevronDown className={cn('h-4 w-4', isPending && 'opacity-0')} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={4} className="min-w-56">
        {catalog.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => logBeer(b)}>
            <Beer aria-hidden />
            <span className="flex-1 truncate">{b.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatMoneyCompact(b.unitPriceMinor, currencyCode, locale)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
