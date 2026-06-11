'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { voidConsumptionAction } from '@/app/[locale]/(app)/log/actions';

// Spec 031 US1 — admin removes a single charge. Reuses the existing
// audited voidConsumptionAction (club_admin satisfies its override role,
// so age/settled state is irrelevant). The confirm runs OUTSIDE the
// transition so the icon doesn't spin while the dialog is open.
export function AdminVoidConsumptionButton({
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
      title: t('voidChargeConfirm', { what: label }),
      confirmLabel: t('voidCharge'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await voidConsumptionAction({ consumptionId });
      if (result.ok) {
        toast.success(t('voidChargeToast'));
      } else {
        toast.error(result.code === 'ALREADY_VOIDED' ? t('alreadyVoided') : t('voidChargeFailed'));
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={t('voidCharge')}
      className="text-destructive hover:bg-destructive/10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
