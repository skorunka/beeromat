'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  createBetTransferAction,
  voidBetTransferAction,
} from '@/app/[locale]/(app)/bet/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';

export interface TransferableView {
  consumptionId: string;
  beerTypeName: string;
  ownerMemberId: string;
  ownerDisplayName: string;
  ownerAvatarKey: string | null;
  ownerAvatarUploadAt: Date | null;
  amountDisplay: string;
}

export interface BetTransferView {
  id: string;
  description: string;
  /** Counterparty = whoever is NOT the viewing member.
   *  Their face leads the row so the user reads the actor at a glance. */
  counterpartyMemberId: string;
  counterpartyDisplayName: string;
  counterpartyAvatarKey: string | null;
  counterpartyAvatarUploadAt: Date | null;
  amountDisplay: string;
  voided: boolean;
  canVoid: boolean;
}

export interface BetTally {
  count: number;
  totalDisplay: string;
}

export function TransferList({
  transferables,
  transfers,
  tally,
}: {
  transferables: TransferableView[];
  transfers: BetTransferView[];
  /** The member's running tally of drinks taken from bets this session;
   *  null when they have taken none (no clutter). */
  tally: BetTally | null;
}) {
  const t = useTranslations('bet');
  const [isPending, startTransition] = useTransition();

  function handleTransfer(consumptionId: string) {
    startTransition(async () => {
      const result = await createBetTransferAction({ sourceConsumptionId: consumptionId });
      if (result.ok) {
        toast.success(t('transferred'));
      } else if (result.code === 'ALREADY_TRANSFERRED') {
        toast.error(t('alreadyTransferred'));
      } else if (result.code === 'OUT_OF_SCOPE') {
        toast.error(t('outOfScope'));
      } else if (result.code === 'SELF_TRANSFER') {
        toast.error(t('selfTransfer'));
      } else {
        toast.error(t('transferFailed'));
      }
    });
  }

  function handleVoid(betTransferId: string) {
    startTransition(async () => {
      const result = await voidBetTransferAction({ betTransferId });
      if (result.ok) {
        toast.success(t('undoneToast'));
      } else if (result.code === 'ALREADY_VOIDED') {
        toast.error(t('alreadyVoided'));
      } else if (result.code === 'FORBIDDEN') {
        toast.error(t('voidForbidden'));
      } else {
        toast.error(t('undoFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {tally ? (
        <Card className="bg-accent p-3 text-sm font-medium">
          {t('tally', { count: tally.count, amount: tally.totalDisplay })}
        </Card>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium">{t('drinksYouCanTake')}</h2>
        {transferables.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noOtherDrinks')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transferables.map((c) => (
              <li key={c.consumptionId}>
                <Card className="flex flex-row items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <MemberAvatar
                      size="inline"
                      avatarKey={c.ownerAvatarKey}
                      displayName={c.ownerDisplayName}
                      uploadUrl={avatarUploadUrl(c.ownerMemberId, c.ownerAvatarUploadAt)}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {c.beerTypeName} · {c.ownerDisplayName}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {c.amountDisplay}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="h-11"
                    disabled={isPending}
                    isPending={isPending}
                    onClick={() => handleTransfer(c.consumptionId)}
                  >
                    {t('transferToMe')}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {transfers.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">{t('betsThisSession')}</h2>
          <ul className="flex flex-col gap-2">
            {transfers.map((tr) => (
              <li key={tr.id}>
                <Card
                  className={`flex items-center justify-between gap-3 p-3 ${
                    tr.voided ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MemberAvatar
                      size="inline"
                      avatarKey={tr.counterpartyAvatarKey}
                      displayName={tr.counterpartyDisplayName}
                      uploadUrl={avatarUploadUrl(tr.counterpartyMemberId, tr.counterpartyAvatarUploadAt)}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {tr.description}
                        {tr.voided ? ` · ${t('undone')}` : ''}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {tr.amountDisplay}
                      </div>
                    </div>
                  </div>
                  {tr.canVoid ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11"
                      disabled={isPending}
                      isPending={isPending}
                      onClick={() => handleVoid(tr.id)}
                    >
                      {t('undo')}
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
