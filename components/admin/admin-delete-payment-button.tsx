'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { hardDeletePaymentAction } from '@/app/[locale]/(app)/admin/pending/actions';

// Admin permanently deletes a payment (any status) to reset fake/test data.
// Unlike reverse (confirmed → voided, keeps the row), this removes the row
// outright; the confirm copy says it can't be undone.
export function AdminDeletePaymentButton({
  paymentId,
  amountLabel,
}: {
  paymentId: string;
  /** Formatted amount for the confirm copy. */
  amountLabel: string;
}) {
  const t = useTranslations('admin');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: t('deletePaymentConfirm', { amount: amountLabel }),
      confirmLabel: t('deletePayment'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await hardDeletePaymentAction(paymentId);
      if (result.ok) {
        toast.success(t('deletePaymentToast'));
      } else {
        toast.error(t('deletePaymentFailed'));
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={t('deletePayment')}
      className="text-destructive hover:bg-destructive/10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
