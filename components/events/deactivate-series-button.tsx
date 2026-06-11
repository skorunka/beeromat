'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Power } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { updateSeriesAction } from '@/app/[locale]/(app)/events/actions';

// Spec 032 US3 — admin deactivates a series (stops generation; soft).
export function DeactivateSeriesButton({ seriesId }: { seriesId: string }) {
  const t = useTranslations('events.admin');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: t('deactivate'),
      confirmLabel: t('deactivate'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await updateSeriesAction({ seriesId, isActive: false });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={t('deactivate')}
      className="text-muted-foreground hover:text-destructive flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    >
      <Power className="h-4 w-4" aria-hidden />
    </button>
  );
}
