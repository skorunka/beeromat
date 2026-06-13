'use client';

import type { Route } from 'next';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Clock, X } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

import {
  deliverBeerDebtAction,
  undeliverBeerDebtAction,
  voidBeerDebtAction,
} from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { BeerPickerDropdown, type BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { celebrateBeer } from '@/lib/celebrate';
import { formatTimeAgo } from '@/lib/format';
import type { BeerDebtRow } from '@/lib/db/queries/match-bet-debts';

// An IOU older than this nudges with an amber "still open" line so it
// doesn't quietly sit forever.
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

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
  /** Server "now" (fixed per render → no hydration drift) for IOU aging. */
  now: Date;
}

export function BeerIouRow({ debt, role, beers, currencyCode, locale, now }: BeerIouRowProps) {
  const t = useTranslations('matchBet');
  const stale = now.getTime() - debt.createdAt.getTime() >= STALE_MS;
  const router = useRouter();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [beerId, setBeerId] = useState<string | null>(debt.plannedBeerTypeId);
  const [isPending, startTransition] = useTransition();
  const [isVoiding, startVoidTransition] = useTransition();

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
      // Undo affordance for the common mis-tap. The toast lives at the
      // app root, so its onClick must be self-contained (this row
      // unmounts once the now-settled debt drops off the list on
      // refresh) — call the action + refresh directly, no component
      // state. Server keeps the undo open for the settledAt window.
      const debtId = debt.debtId;
      toast.success(t('settledToast', { beer: result.beerName, name: result.loserName }), {
        duration: 10000,
        action: {
          label: t('undoDeliver'),
          onClick: async () => {
            const undo = await undeliverBeerDebtAction({ debtId });
            if (!undo.ok) {
              toast.error(
                undo.code === 'UNDO_WINDOW_EXPIRED' ? t('undoExpired') : t('deliverFailed'),
              );
            } else {
              toast.success(t('undoneToast', { name: undo.loserName }));
            }
            router.refresh();
          },
        },
      });
      router.refresh();
    });
  }

  // Write off ("Odepsat") — winner forgives the debt, no money moves.
  // Only rendered for the winner (role 'owed'); the confirm runs OUTSIDE
  // the transition so the button doesn't spin while the dialog is open.
  async function writeOff() {
    const ok = await confirm({
      title: t('writeOffConfirm', { name: debt.counterpartyName }),
      confirmLabel: t('writeOff'),
      destructive: true,
    });
    if (!ok) return;
    startVoidTransition(async () => {
      const result = await voidBeerDebtAction({ debtId: debt.debtId });
      if (!result.ok) {
        toast.error(result.code === 'ALREADY_SETTLED' ? t('alreadySettled') : t('deliverFailed'));
        router.refresh();
        return;
      }
      toast.success(t('writeOffToast', { name: result.loserName }));
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        {/* Spec 036 — tap the counterparty (avatar + name) to open their profile.
            The deliver/write-off buttons stay siblings — never inside this Link. */}
        <Link
          href={`/members/${debt.counterpartyMemberId}` as Route}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <MemberAvatar
            size="row"
            avatarKey={debt.counterpartyAvatarKey}
            displayName={debt.counterpartyName}
            uploadUrl={avatarUploadUrl(debt.counterpartyMemberId, debt.counterpartyAvatarUploadAt)}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium underline-offset-2 group-hover:underline">
              {label}
            </div>
          {debt.plannedBeerName ? (
            <div className="text-muted-foreground truncate text-xs">
              {debt.beerCount > 1 ? `${debt.beerCount}× ` : ''}
              {debt.plannedBeerName}
            </div>
          ) : null}
          {stale ? (
            <div className="text-primary mt-0.5 flex items-center gap-1 text-xs font-medium">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                {formatTimeAgo(debt.createdAt, now, locale)} ·{' '}
                {role === 'owe' ? t('stalePokeOwe') : t('stalePokeOwed')}
              </span>
            </div>
          ) : null}
          </div>
        </Link>
        {!expanded ? (
          <div className="flex shrink-0 items-center gap-1">
            {/* Winner-only escape hatch: forgive a debt you'll never
                collect (e.g. the loser left the club). The loser can't
                write off their own IOU. */}
            {role === 'owed' ? (
              <button
                type="button"
                onClick={writeOff}
                disabled={isVoiding}
                className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-md px-2 text-xs disabled:opacity-50"
              >
                {t('writeOff')}
              </button>
            ) : null}
            <Button type="button" size="sm" onClick={() => setExpanded(true)}>
              {t('deliver')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            disabled={isPending}
            aria-label={t('cancel')}
            className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
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
            disabled={isPending}
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
