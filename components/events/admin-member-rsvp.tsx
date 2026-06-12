'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';

import { clearMemberRsvpAction, setMemberRsvpAction } from '@/app/[locale]/(app)/events/actions';
import { cn } from '@/lib/utils';

// Spec 032 US4 — admin-only on-behalf set of a member's status. Rendered ONLY
// for club_admins (the page gates it), so regular members can never edit
// anyone but themselves — the sejdemse accidental-edit fix.
export function AdminMemberRsvp({
  occurrenceId,
  memberId,
  status,
}: {
  occurrenceId: string;
  memberId: string;
  status: 'going' | 'not_going' | null;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function set(next: 'going' | 'not_going') {
    if (isPending) return;
    // Tapping the member's current choice resets it (no answer).
    const undo = status === next;
    startTransition(async () => {
      const r = undo
        ? await clearMemberRsvpAction({ occurrenceId, memberId })
        : await setMemberRsvpAction({ occurrenceId, memberId, status: next });
      if (r.ok) toast.success(undo ? t('clearedToast') : t('savedToast'));
      else toast.error(t('failedToast'));
      router.refresh();
    });
  }

  return (
    <span className="flex shrink-0 gap-1" aria-label={t('admin.setForMember')}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => set('going')}
        aria-label={t('going')}
        className={cn(
          'flex size-6 items-center justify-center rounded disabled:opacity-50',
          status === 'going' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => set('not_going')}
        aria-label={t('notGoing')}
        className={cn(
          'flex size-6 items-center justify-center rounded disabled:opacity-50',
          status === 'not_going' ? 'bg-destructive/15 text-destructive' : 'hover:bg-muted text-muted-foreground',
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}
