'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';

import { setMyRsvpAction } from '@/app/[locale]/(app)/events/actions';
import { cn } from '@/lib/utils';

// Spec 032 US1 — a member's own going/not-going toggle. Optimistic-feel via
// router.refresh on success; disabled when the occurrence is closed.
export function RsvpToggle({
  occurrenceId,
  status,
  disabled = false,
}: {
  occurrenceId: string;
  status: 'going' | 'not_going' | null;
  disabled?: boolean;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function set(next: 'going' | 'not_going') {
    if (disabled || isPending) return;
    startTransition(async () => {
      const r = await setMyRsvpAction({ occurrenceId, status: next });
      if (r.ok) toast.success(next === 'going' ? t('goingToast') : t('notGoingToast'));
      else toast.error(r.code === 'CLOSED' ? t('closedToast') : t('failedToast'));
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => set('going')}
        className={cn(
          'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50',
          status === 'going'
            ? 'border-transparent bg-primary text-primary-foreground'
            : 'border-border bg-background hover:bg-muted',
        )}
      >
        <Check className="h-4 w-4" aria-hidden /> {t('going')}
      </button>
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => set('not_going')}
        className={cn(
          'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50',
          status === 'not_going'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border bg-background hover:bg-muted',
        )}
      >
        <X className="h-4 w-4" aria-hidden /> {t('notGoing')}
      </button>
    </div>
  );
}
