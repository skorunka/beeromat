'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateBankingProfileAction } from '@/app/[locale]/(app)/admin/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BankingFormProps {
  initial: {
    iban: string | null;
    accountHolderName: string | null;
    revolutHandle: string | null;
    defaultQrMessage: string | null;
  };
}

export function BankingForm({ initial }: BankingFormProps) {
  const [iban, setIban] = useState(initial.iban ?? '');
  const [accountHolderName, setAccountHolderName] = useState(
    initial.accountHolderName ?? '',
  );
  const [revolutHandle, setRevolutHandle] = useState(initial.revolutHandle ?? '');
  const [defaultQrMessage, setDefaultQrMessage] = useState(
    initial.defaultQrMessage ?? '',
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Empty string → null (clears the field); otherwise the trimmed value.
    const norm = (v: string) => (v.trim() === '' ? null : v.trim());
    startTransition(async () => {
      const result = await updateBankingProfileAction({
        iban: norm(iban),
        accountHolderName: norm(accountHolderName),
        revolutHandle: norm(revolutHandle),
        defaultQrMessage: norm(defaultQrMessage),
      });
      if (result.ok) {
        toast.success('Banking profile saved.');
      } else if (result.code === 'INVALID_IBAN') {
        toast.error('That IBAN is not valid. Check it and try again.');
      } else {
        toast.error('Could not save. Check the fields and try again.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-iban">IBAN</Label>
        <Input
          id="bank-iban"
          placeholder="CZ65 0800 0000 1920 0014 5399"
          autoComplete="off"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Required for QR-code payments. Clearing it disables member self-pay.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-holder">Account holder name</Label>
        <Input
          id="bank-holder"
          value={accountHolderName}
          onChange={(e) => setAccountHolderName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-revolut">Revolut handle</Label>
        <Input
          id="bank-revolut"
          placeholder="@yourclub"
          value={revolutHandle}
          onChange={(e) => setRevolutHandle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-qr-message">Default QR message</Label>
        <Input
          id="bank-qr-message"
          placeholder="Tennis club beers"
          maxLength={60}
          value={defaultQrMessage}
          onChange={(e) => setDefaultQrMessage(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save banking profile'}
      </Button>
    </form>
  );
}
