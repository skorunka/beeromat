'use client';

import { useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { confirmTransferMadeAction } from '@/app/[locale]/(app)/settle/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface QrDisplayProps {
  qrSvg: string;
  amountDisplay: string;
  variableSymbol: string;
}

export function QrDisplay({ qrSvg, amountDisplay, variableSymbol }: QrDisplayProps) {
  const router = useRouter();
  const t = useTranslations('settle');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  function handlePaid() {
    startTransition(async () => {
      const result = await confirmTransferMadeAction({ variableSymbol });
      if (result.ok) {
        toast.success(t('markedPaid'));
        router.push('/' as Route);
      } else if (result.code === 'CLAIM_PENDING') {
        toast.error(t('claimPending'));
      } else if (result.code === 'NO_BALANCE') {
        toast.error(t('noBalance'));
      } else {
        toast.error(t('recordFailed'));
      }
    });
  }

  return (
    <Card className="mb-4 p-6">
      <div
        className="mx-auto h-64 w-64 [&>svg]:h-full [&>svg]:w-full"
        // SPAYD QR rendered server-side by the `qrcode` package — trusted SVG.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('amount')}</dt>
          <dd className="font-semibold">{amountDisplay}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('variableSymbol')}</dt>
          <dd className="font-mono">{variableSymbol}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">{t('scanHint')}</p>
      <Button
        type="button"
        className="mt-4 w-full"
        disabled={isPending}
        onClick={handlePaid}
      >
        {isPending ? tCommon('saving') : t('iPaid')}
      </Button>
    </Card>
  );
}
