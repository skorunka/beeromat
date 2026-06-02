'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { X } from 'lucide-react';

import { deliverBeerDebtAction } from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { BeerPickerDropdown, type BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { celebrateBeer } from '@/lib/celebrate';
import type { BeerDebtRow } from '@/lib/db/queries/match-bet-debts';

// Spec 030 — one beer-IOU row + its deliver ("Předáno") control.
// Shared by the home module and the /match "Sázky k vyrovnání" list.
// role 'owed' → I'm the winner ({name} owes me); 'owe' → I'm the loser
// (I owe {name}). Either way both parties can hand the beer over, so the
// deliver control is shown for both. Tapping "Předáno" reveals the beer
// (planned pre-selected, overridable) + a confirm; on success the cost
// lands on the loser's tab and the IOU is gone.

interface BeerIouRowProps {
  debt: BeerDebtRow;
  role: 'owed' | 'owe';
  beers: BeerPickerOption[];
  currencyCode: string;
  locale: string;
}

export function BeerIouRow({ debt, role, beers, currencyCode, locale }: BeerIouRowProps) {
  const t = useTranslations('matchBet');
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [beerId, setBeerId] = useState<string | null>(debt.plannedBeerTypeId);
  const [isPending, startTransition] = useTransition();

  const label =
    role === 'owed'
      ? t('owedBeer', { name: debt.counterpartyName })
      : t('oweBeer', { name: debt.counterpartyName });

  function deliver() {
    startTransition(async () => {
      const result = await deliverBeerDebtAction({ debtId: debt.debtId, beerTypeId: beerId });
      if (!result.ok) {
        if (result.code === 'ALREADY_SETTLED') toast.error(t('alreadySettled'));
        else toast.error(t('deliverFailed'));
        router.refresh();
        return;
      }
      celebrateBeer();
      toast.success(t('settledToast', { beer: result.beerName, name: result.loserName }));
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <MemberAvatar
          size="row"
          avatarKey={debt.counterpartyAvatarKey}
          displayName={debt.counterpartyName}
          uploadUrl={avatarUploadUrl(debt.counterpartyMemberId, debt.counterpartyAvatarUploadAt)}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{label}</div>
          {debt.plannedBeerName ? (
            <div className="text-muted-foreground truncate text-xs">
              {debt.beerCount > 1 ? `${debt.beerCount}× ` : ''}
              {debt.plannedBeerName}
            </div>
          ) : null}
        </div>
        {!expanded ? (
          <Button type="button" size="sm" onClick={() => setExpanded(true)} className="shrink-0">
            {t('deliver')}
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label={t('cancel')}
            className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          >
            <X className="size-[1.1rem]" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2">
          <BeerPickerDropdown
            beers={beers}
            value={beerId}
            onChange={setBeerId}
            currencyCode={currencyCode}
            locale={locale}
            placeholder={t('beerPlaceholder')}
            ariaLabel={t('beerPlaceholder')}
          />
          <Button
            type="button"
            size="lg"
            disabled={!beerId || isPending}
            isPending={isPending}
            onClick={deliver}
            className="h-12"
          >
            {t('deliver')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
