'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { recordManualPaymentAction } from '@/app/[locale]/(app)/admin/balances/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ManualPaymentFormProps {
  memberId: string;
  currencyCode: string;
}

/** Major-unit decimal string → integer minor units. */
function toMinor(major: string): bigint | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(major.trim())) return null;
  const [whole = '0', frac = ''] = major.trim().replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

/**
 * Treasurer records a cash / out-of-band payment against the member
 * whose detail page this form lives on. The payment is confirmed
 * immediately (treasurer_initiated origin).
 */
export function ManualPaymentForm({ memberId, currencyCode }: ManualPaymentFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountMinor = toMinor(amount);
    if (amountMinor === null || amountMinor <= 0n) {
      toast.error('Enter a valid amount.');
      return;
    }
    startTransition(async () => {
      const result = await recordManualPaymentAction({
        memberId,
        amountMinor: amountMinor.toString(),
        note: note.trim() || undefined,
      });
      if (result.ok) {
        toast.success('Payment recorded.');
        setAmount('');
        setNote('');
        router.refresh();
      } else if (result.code === 'NOT_FOUND') {
        toast.error('Member not found.');
      } else {
        toast.error('Enter a valid amount.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="manual-amount">Amount ({currencyCode})</Label>
        <Input
          id="manual-amount"
          inputMode="decimal"
          placeholder="120.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="manual-note">Note</Label>
        <Input
          id="manual-note"
          placeholder="cash received"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Recording…' : 'Record payment'}
      </Button>
    </form>
  );
}
