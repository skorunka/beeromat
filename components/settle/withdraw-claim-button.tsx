'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { withdrawPaymentClaimAction } from '@/app/[locale]/(app)/settle/actions';

// Lets a member cancel their own pending payment claim from the
// "waiting for treasurer" state, instead of being stuck until the
// treasurer acts. Confirms via the app dialog (no window.confirm),
// then refreshes so /settle re-evaluates back to the pay screen.
export function WithdrawClaimButton() {
  const t = useTranslations('settle');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, start] = useTransition();

  async function onWithdraw() {
    const confirmed = await confirm({
      title: t('withdrawConfirm'),
      confirmLabel: t('withdraw'),
      cancelLabel: tCommon('back'),
      destructive: true,
    });
    if (!confirmed) return;
    start(async () => {
      const result = await withdrawPaymentClaimAction();
      if (!result.ok) {
        toast.error(t('withdrawError'));
        router.refresh();
        return;
      }
      toast.success(t('withdrawnToast'));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onWithdraw}
      disabled={isPending}
      isPending={isPending}
      className="mt-4"
    >
      {t('withdraw')}
    </Button>
  );
}
