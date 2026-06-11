'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarX } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { cancelOccurrenceAction } from '@/app/[locale]/(app)/events/actions';

// Spec 032 US3 — admin cancels a single occurrence (soft). Confirm-gated.
export function CancelOccurrenceButton({ occurrenceId }: { occurrenceId: string }) {
  const t = useTranslations('events');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: t('admin.cancelOccurrence'),
      confirmLabel: t('admin.cancelOccurrence'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await cancelOccurrenceAction({ occurrenceId });
      if (r.ok) toast.success(t('savedToast'));
      else toast.error(t('failedToast'));
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="text-destructive hover:bg-destructive/10 inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50"
    >
      <CalendarX className="h-4 w-4" aria-hidden />
      {t('admin.cancelOccurrence')}
    </button>
  );
}
