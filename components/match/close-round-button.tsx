'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { closeRoundAction } from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';

// End-of-night "close this round" control. Inline two-step confirm
// (not a modal) because closing ends the casual-bet window for the
// round and can't be undone, but it's communal + non-destructive so
// any member may do it.
export function CloseRoundButton() {
  const t = useTranslations('match.closeRound');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function close() {
    startTransition(async () => {
      const result = await closeRoundAction();
      if (result.ok) {
        toast.success(t('closed'));
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(t('noOpenRound'));
        setConfirming(false);
        router.refresh();
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center self-center text-sm underline-offset-4 hover:underline"
      >
        {t('cta')}
      </button>
    );
  }

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm">{t('confirm')}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          isPending={isPending}
          onClick={close}
        >
          {t('confirmCta')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
