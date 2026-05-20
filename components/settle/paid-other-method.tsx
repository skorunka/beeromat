'use client';

import { useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { markPaidOtherMethodAction } from '@/app/[locale]/(app)/settle/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PaidOtherMethodProps {
  /** Outstanding balance in minor units (string-serialised bigint). */
  defaultAmountMinor: string;
  currencyCode: string;
}

/** Major-unit decimal string → integer minor units. */
function toMinor(major: string): bigint | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(major.trim())) return null;
  const [whole = '0', frac = ''] = major.trim().replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

/**
 * Records a payment made outside the QR flow (cash handed over, a
 * direct Revolut transfer). Note is mandatory so the treasurer has
 * context when confirming.
 */
export function PaidOtherMethod({ defaultAmountMinor, currencyCode }: PaidOtherMethodProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    (Number(BigInt(defaultAmountMinor)) / 100).toFixed(2),
  );
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountMinor = toMinor(amount);
    if (amountMinor === null || amountMinor <= 0n) {
      toast.error('Enter a valid amount.');
      return;
    }
    if (!note.trim()) {
      toast.error('Add a short note (e.g. "cash to treasurer").');
      return;
    }
    startTransition(async () => {
      const result = await markPaidOtherMethodAction({
        amountMinor: amountMinor.toString(),
        note,
      });
      if (result.ok) {
        toast.success('Recorded — awaiting treasurer confirmation.');
        router.push('/' as Route);
      } else if (result.code === 'CLAIM_PENDING') {
        toast.error('You already have a payment awaiting confirmation.');
      } else {
        toast.error('Could not record the payment. Try again.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground w-full py-2 text-sm underline"
      >
        I paid another way (cash, direct transfer)
      </button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="other-amount">Amount ({currencyCode})</Label>
          <Input
            id="other-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="other-note">Note</Label>
          <Input
            id="other-note"
            placeholder="cash to treasurer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Record payment'}
        </Button>
      </form>
    </Card>
  );
}
