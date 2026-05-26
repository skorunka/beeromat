'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Beer } from 'lucide-react';

import {
  dismissOnBehalfReviewAction,
  voidConsumptionAction,
} from '@/app/[locale]/(app)/log/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Spec 019 — proactive notification on home listing every
// on-behalf log made for the consumer since their previous
// review action. Two buttons per row: Vrátit (void + dismiss)
// and Nechat (dismiss only — consumption stays).

export interface OnBehalfReviewBannerRow {
  consumptionId: string;
  loggerDisplayName: string;
  beerName: string;
}

export function OnBehalfReviewBanner({ rows }: { rows: OnBehalfReviewBannerRow[] }) {
  const t = useTranslations('home.onBehalfReview');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function handleReject(row: OnBehalfReviewBannerRow) {
    startTransition(async () => {
      // Void first (the destructive action). If that fails, don't
      // dismiss — leave the banner so the user can retry.
      const voidResult = await voidConsumptionAction({ consumptionId: row.consumptionId });
      if (!voidResult.ok) {
        toast.error(t('toastError'));
        return;
      }
      // Stamp the review so the banner row disappears even if the
      // consumer comes back later (the void already would have
      // hidden it, but the dismiss is defensive).
      await dismissOnBehalfReviewAction({ consumptionId: row.consumptionId });
      toast.success(t('toastRejected'));
      router.refresh();
    });
  }

  function handleKeep(row: OnBehalfReviewBannerRow) {
    startTransition(async () => {
      const result = await dismissOnBehalfReviewAction({ consumptionId: row.consumptionId });
      if (!result.ok && result.code !== 'ALREADY_REVIEWED') {
        toast.error(t('toastError'));
        return;
      }
      toast.success(t('toastKept'));
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        {t('heading')}
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.consumptionId} className="flex flex-col gap-2">
            <p className="text-sm leading-snug">
              <Beer className="mr-1 inline-block h-4 w-4" aria-hidden />
              {t('one', { logger: row.loggerDisplayName, beer: row.beerName })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleReject(row)}
              >
                {t('reject')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleKeep(row)}
              >
                {t('keep')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
