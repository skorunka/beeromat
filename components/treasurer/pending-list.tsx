'use client';

import { useState, useTransition } from 'react';
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
      if (result.ok) toast.success('Payment confirmed.');
      else if (result.code === 'INVALID_STATE') toast.error('That payment is no longer pending.');
      else toast.error('Payment not found.');
    });
  }

  function handleConfirmSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await bulkConfirmPaymentsAction(ids);
      setSelected(new Set());
      if (result.confirmed.length > 0) {
        toast.success(`Confirmed ${result.confirmed.length} payment(s).`);
      }
      if (result.skipped.length > 0) {
        toast.error(`Skipped ${result.skipped.length} (no longer pending).`);
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
        toast.success('Payment disputed — the member will be notified.');
        setDisputeTarget(null);
        setDisputeReason('');
      } else if (result.code === 'INVALID_STATE') {
        toast.error('That payment is no longer pending.');
      } else {
        toast.error('Could not dispute the payment.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <Button type="button" disabled={isPending} onClick={handleConfirmSelected}>
          Confirm {selected.size} selected
        </Button>
      ) : null}

      <ul className="flex flex-col gap-2">
        {claims.map((claim) => (
          <li key={claim.paymentId}>
            <Card className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                aria-label={`Select ${claim.memberDisplayName}`}
                checked={selected.has(claim.paymentId)}
                onChange={() => toggle(claim.paymentId)}
                className="size-4"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{claim.memberDisplayName}</div>
                <div className="text-muted-foreground text-xs">
                  {claim.createdAtDisplay}
                  {claim.variableSymbol ? ` · VS ${claim.variableSymbol}` : ''}
                  {claim.note ? ` · ${claim.note}` : ''}
                </div>
              </div>
              <div className="font-mono text-sm font-semibold">{claim.amountDisplay}</div>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => handleConfirm(claim.paymentId)}
              >
                Confirm received
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => setDisputeTarget(claim)}
              >
                Dispute
              </Button>
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
            <DialogTitle>Dispute payment</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {disputeTarget
              ? `Reject ${disputeTarget.memberDisplayName}'s claim of ${disputeTarget.amountDisplay}. The member sees the reason.`
              : null}
          </p>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value.slice(0, 500))}
            placeholder="e.g. no matching transfer on the bank statement"
            rows={3}
            className="border-input bg-background w-full rounded-md border p-2 text-sm"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !disputeReason.trim()}
            onClick={handleDispute}
          >
            {isPending ? 'Saving…' : 'Dispute payment'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
