'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

import { reverseResultAction } from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';

// Reverse-match control on the recorded-match detail page.
// Without it, home's "Reverse match" link sent users to the agreement
// page where the action was unreachable — the only reverse path was
// RecordResultForm's in-session `recent` state, which is lost on
// navigation/reload. Server gates visibility on the 5-min UNDO_WINDOW
// + participant/treasurer authz.
export function ReverseMatchButton({ agreementId }: { agreementId: string }) {
  const t = useTranslations('match');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function reverse() {
    startTransition(async () => {
      const result = await reverseResultAction({ agreementId });
      if (result.ok) {
        toast.success(t('reversedToast'));
        router.refresh();
        return;
      }
      if (result.code === 'UNDO_WINDOW_EXPIRED') {
        toast.error(t('undoWindowExpired'));
      } else if (result.code === 'NOT_AUTHORIZED') {
        toast.error(t('errors.notAuthorized'));
      } else {
        toast.error(t('errors.generic'));
      }
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      disabled={isPending}
      isPending={isPending}
      onClick={reverse}
      className="self-start gap-2"
    >
      <Undo2 className="h-4 w-4" aria-hidden />
      {t('reverseCta')}
    </Button>
  );
}
