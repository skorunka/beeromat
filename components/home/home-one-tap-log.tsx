'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Beer } from 'lucide-react';

import { logBeerAction } from '@/app/[locale]/(app)/log/actions';
import { celebrateBeer } from '@/lib/celebrate';
import { Link } from '@/lib/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec 017 — one-tap "log my last beer" button for the home screen.
// Variant decision is a pure function of the `beer` prop (data-model.md
// + contracts/home-page.md). Five variants:
//   beer === null              → V3 first-time: generic link to /log
//   beer.isArchived            → V4 archived: generic link to /log
//   beer.currentStock <= 0     → V5 out-of-stock: disabled button + picker link
//   otherwise                  → V1 enabled: tap to log
// V6 (pending) is a transient render state during the server round-trip.

export interface HomeOneTapLogBeer {
  id: string;
  name: string;
  currentStock: number;
  isArchived: boolean;
  unitPriceMinor: bigint;
}

interface HomeOneTapLogProps {
  beer: HomeOneTapLogBeer | null;
  currencyCode: string;
  locale: string;
}

export function HomeOneTapLog({ beer, currencyCode, locale }: HomeOneTapLogProps) {
  const t = useTranslations('home');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // V3 (no last beer) + V4 (archived) collapse to the generic Link.
  const showGeneric = beer === null || beer.isArchived;
  if (showGeneric) {
    return (
      <Link
        href="/log"
        className={cn(
          buttonVariants({ size: 'lg' }),
          'h-14 w-full gap-2 text-base',
        )}
      >
        <Beer className="h-5 w-5" aria-hidden />
        {t('oneTapLogGeneric')}
      </Link>
    );
  }

  // V5 — out of stock: render the beer name but disable the action.
  if (beer.currentStock <= 0) {
    return (
      <div className="flex flex-col items-stretch gap-2">
        <Button
          type="button"
          size="lg"
          disabled
          aria-disabled="true"
          className="h-14 w-full gap-2 text-base"
        >
          <Beer className="h-5 w-5" aria-hidden />
          {t('oneTapLogUnavailable', { beer: beer.name })}
        </Button>
        <Link
          href="/log"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center justify-center text-sm underline-offset-4 hover:underline"
        >
          {t('pickAnother')}
        </Link>
      </div>
    );
  }

  // V1 — enabled. Tap once, fire-and-forget the server action, toast
  // success/failure, router.refresh() to re-pull the balance.
  function handleTap() {
    if (!beer) return; // narrowed above, but TS doesn't follow across closures.
    startTransition(async () => {
      const result = await logBeerAction({ beerTypeId: beer.id });
      if (result.ok) {
        celebrateBeer();
        toast.success(
          t('toastLogged', {
            balance: formatMoney(result.balanceAfterMinor, currencyCode, locale),
          }),
        );
        router.refresh();
      } else {
        toast.error(t('toastError'));
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        type="button"
        size="lg"
        onClick={handleTap}
        disabled={isPending}
        isPending={isPending}
        aria-busy={isPending ? 'true' : undefined}
        className="h-14 w-full gap-2 text-base"
      >
        {isPending ? null : <Beer className="h-5 w-5" aria-hidden />}
        {t('oneTapLog', {
          beer: beer.name,
          price: formatMoneyCompact(beer.unitPriceMinor, currencyCode, locale),
        })}
      </Button>
      <Link
        href="/log"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center justify-center text-sm underline-offset-4 hover:underline"
      >
        {t('pickAnother')}
      </Link>
    </div>
  );
}
