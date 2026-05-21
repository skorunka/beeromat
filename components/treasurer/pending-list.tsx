'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  bulkConfirmPaymentsAction,
  confirmPaymentAction,
  disputePaymentAction,
} from '@/app/[locale]/(app)/admin/pending/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface PendingClaimView {
  paymentId: string;
  memberDisplayName: string;
  amountDisplay: string;
  variableSymbol: string | null;
  note: string | null;
  createdAtDisplay: string;
}

export function PendingList({ claims }: { claims: PendingClaimView[] }) {
  const t = useTranslations('treasurer');
  const tCommon = useTranslations('common');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disputeTarget, setDisputeTarget] = useState<PendingClaimView | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm(id: string) {
    startTransition(async () => {
      const result = await confirmPaymentAction(id);
      if (result.ok) toast.success(t('paymentConfirmed'));
      else if (result.code === 'INVALID_STATE') toast.error(t('noLongerPending'));
      else toast.error(t('notFound'));
    });
  }

  function handleConfirmSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await bulkConfirmPaymentsAction(ids);
      setSelected(new Set());
      if (result.confirmed.length > 0) {
        toast.success(t('bulkConfirmed', { count: result.confirmed.length }));
      }
      if (result.skipped.length > 0) {
        toast.error(t('bulkSkipped', { count: result.skipped.length }));
      }
    });
  }

  function handleDispute() {
    if (!disputeTarget || !disputeReason.trim()) return;
    const target = disputeTarget;
    startTransition(async () => {
      const result = await disputePaymentAction({
        paymentId: target.paymentId,
        reason: disputeReason.trim(),
      });
      if (result.ok) {
        toast.success(t('disputed'));
        setDisputeTarget(null);
        setDisputeReason('');
      } else if (result.code === 'INVALID_STATE') {
        toast.error(t('noLongerPending'));
      } else {
        toast.error(t('disputeFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <Button type="button" disabled={isPending} onClick={handleConfirmSelected}>
          {t('confirmSelected', { count: selected.size })}
        </Button>
      ) : null}

      <ul className="flex flex-col gap-2">
        {claims.map((claim) => (
          <li key={claim.paymentId}>
            <Card className="flex flex-col gap-3 p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={t('selectMember', { name: claim.memberDisplayName })}
                  checked={selected.has(claim.paymentId)}
                  onChange={() => toggle(claim.paymentId)}
                  className="mt-1 size-5"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{claim.memberDisplayName}</div>
                  <div className="text-muted-foreground text-xs">
                    {claim.createdAtDisplay}
                    {claim.variableSymbol ? ` · VS ${claim.variableSymbol}` : ''}
                    {claim.note ? ` · ${claim.note}` : ''}
                  </div>
                </div>
                <div className="font-mono text-base font-semibold">{claim.amountDisplay}</div>
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  className="h-11 flex-1"
                  disabled={isPending}
                  onClick={() => handleConfirm(claim.paymentId)}
                >
                  {t('confirmReceived')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  disabled={isPending}
                  onClick={() => setDisputeTarget(claim)}
                >
                  {t('dispute')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog
        open={disputeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisputeTarget(null);
            setDisputeReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('disputeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {disputeTarget
              ? t('disputeBody', {
                  name: disputeTarget.memberDisplayName,
                  amount: disputeTarget.amountDisplay,
                })
              : null}
          </p>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value.slice(0, 500))}
            placeholder={t('disputeReasonPlaceholder')}
            rows={3}
            className="border-input bg-background w-full rounded-md border p-2 text-sm"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !disputeReason.trim()}
            onClick={handleDispute}
          >
            {isPending ? tCommon('saving') : t('disputeSubmit')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
