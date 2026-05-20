'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  createBetTransferAction,
  voidBetTransferAction,
} from '@/app/[locale]/(app)/bet/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface TransferableView {
  consumptionId: string;
  label: string;
  amountDisplay: string;
}

export interface BetTransferView {
  id: string;
  description: string;
  amountDisplay: string;
  voided: boolean;
  canVoid: boolean;
}

export function TransferList({
  transferables,
  transfers,
}: {
  transferables: TransferableView[];
  transfers: BetTransferView[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleTransfer(consumptionId: string) {
    startTransition(async () => {
      const result = await createBetTransferAction({ sourceConsumptionId: consumptionId });
      if (result.ok) {
        toast.success('Transferred onto your tab.');
      } else if (result.code === 'ALREADY_TRANSFERRED') {
        toast.error('That drink has already been transferred.');
      } else if (result.code === 'OUT_OF_SCOPE') {
        toast.error('That drink is from a closed session.');
      } else if (result.code === 'SELF_TRANSFER') {
        toast.error('You can only transfer another member’s drink.');
      } else {
        toast.error('Could not transfer that drink.');
      }
    });
  }

  function handleVoid(betTransferId: string) {
    startTransition(async () => {
      const result = await voidBetTransferAction({ betTransferId });
      if (result.ok) {
        toast.success('Transfer undone.');
      } else if (result.code === 'ALREADY_VOIDED') {
        toast.error('That transfer is already undone.');
      } else if (result.code === 'FORBIDDEN') {
        toast.error('Only the person who made the transfer (or a treasurer) can undo it.');
      } else {
        toast.error('Could not undo that transfer.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Drinks you can take</h2>
        {transferables.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No other members have logged a drink this session.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transferables.map((c) => (
              <li key={c.consumptionId}>
                <Card className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.label}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {c.amountDisplay}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleTransfer(c.consumptionId)}
                  >
                    Transfer to me
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {transfers.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">Bets this session</h2>
          <ul className="flex flex-col gap-2">
            {transfers.map((t) => (
              <li key={t.id}>
                <Card
                  className={`flex items-center justify-between gap-3 p-3 ${
                    t.voided ? 'opacity-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {t.description}
                      {t.voided ? ' · undone' : ''}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {t.amountDisplay}
                    </div>
                  </div>
                  {t.canVoid ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleVoid(t.id)}
                    >
                      Undo
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
