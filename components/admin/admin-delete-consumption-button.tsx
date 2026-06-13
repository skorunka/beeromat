'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { hardDeleteConsumptionAction } from '@/app/[locale]/(app)/log/actions';

// Admin permanently deletes a fake/test charge. Unlike the void button this
// removes the row outright — the confirm copy says so (cannot be undone). The
// confirm runs OUTSIDE the transition so the icon doesn't spin mid-dialog.
export function AdminDeleteConsumptionButton({
  consumptionId,
  label,
}: {
  consumptionId: string;
  /** Human label for the confirm copy, e.g. the beer name. */
  label: string;
}) {
  const t = useTranslations('admin');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: t('deleteChargeConfirm', { what: label }),
      confirmLabel: t('deleteCharge'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await hardDeleteConsumptionAction({ consumptionId });
      if (result.ok) {
        toast.success(t('deleteChargeToast'));
      } else {
        toast.error(
          result.code === 'MATCH_LINKED' ? t('deleteChargeMatchLinked') : t('deleteChargeFailed'),
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
      aria-label={t('deleteCharge')}
      className="text-destructive hover:bg-destructive/10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
