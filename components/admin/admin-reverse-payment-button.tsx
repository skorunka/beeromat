'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { voidConfirmedPaymentAction } from '@/app/[locale]/(app)/admin/pending/actions';

// Spec 031 US2 — admin reverses a confirmed payment. Reuses the existing
// audited voidConfirmedPaymentAction (confirmed → voided via a payment
// state transition; balance owed rises back). reason is required by the
// action's schema; a stable 'admin-correction' marker is passed (not
// display prose).
export function AdminReversePaymentButton({
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
      title: t('reversePaymentConfirm', { amount: amountLabel }),
      confirmLabel: t('reversePayment'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await voidConfirmedPaymentAction({
        paymentId,
        reason: 'admin-correction',
      });
      if (result.ok) {
        toast.success(t('reversePaymentToast'));
      } else {
        toast.error(
          result.code === 'INVALID_STATE' ? t('alreadyReversed') : t('reversePaymentFailed'),
        );
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:opacity-50"
    >
      <Undo2 className="h-4 w-4" aria-hidden />
      {t('reversePayment')}
    </button>
  );
}
