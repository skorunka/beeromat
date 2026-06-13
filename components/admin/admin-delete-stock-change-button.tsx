'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { deleteStockChangeAction } from '@/app/[locale]/(app)/admin/beer-types/actions';

// Admin removes a single stock-movement history row (fake/test cleanup).
// Doesn't change the stock count (a stored counter) — just tidies the log.
export function AdminDeleteStockChangeButton({
  stockChangeId,
  label,
}: {
  stockChangeId: string;
  /** Human label for the confirm copy, e.g. the movement kind. */
  label: string;
}) {
  const t = useTranslations('admin');
  const confirm = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: t('deleteStockChangeConfirm', { what: label }),
      confirmLabel: t('deleteStockChange'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteStockChangeAction(stockChangeId);
      if (result.ok) {
        toast.success(t('deleteStockChangeToast'));
      } else {
        toast.error(t('deleteStockChangeFailed'));
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={t('deleteStockChange')}
      className="text-destructive hover:bg-destructive/10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
