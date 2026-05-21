'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
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
        toast.success(t('bankingSaved'));
      } else if (result.code === 'INVALID_IBAN') {
        toast.error(t('invalidIban'));
      } else {
        toast.error(t('bankingFailed'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-iban">{t('ibanLabel')}</Label>
        <Input
          id="bank-iban"
          placeholder="CZ65 0800 0000 1920 0014 5399"
          autoComplete="off"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t('ibanHint')}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-holder">{t('accountHolderLabel')}</Label>
        <Input
          id="bank-holder"
          value={accountHolderName}
          onChange={(e) => setAccountHolderName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-revolut">{t('revolutLabel')}</Label>
        <Input
          id="bank-revolut"
          placeholder="@yourclub"
          value={revolutHandle}
          onChange={(e) => setRevolutHandle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-qr-message">{t('qrMessageLabel')}</Label>
        <Input
          id="bank-qr-message"
          placeholder={t('qrMessagePlaceholder')}
          maxLength={60}
          value={defaultQrMessage}
          onChange={(e) => setDefaultQrMessage(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon('saving') : t('saveBanking')}
      </Button>
    </form>
  );
}
