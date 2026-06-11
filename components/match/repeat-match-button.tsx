'use client';

import { useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import { recreateMatchAction } from '@/app/[locale]/(app)/match/actions';
import { cn } from '@/lib/utils';

// Spec 027 follow-up — per-row "repeat this match" on the /match hub's
// recently-played list. Clones an ARBITRARY past matchup into a new
// OPEN agreement (vs RecreateLastMatchButton, which only repeats the
// single most-recent one). Compact icon button so it sits inside the
// result row without crowding the matchup text; the action re-resolves
// the agreement server-side (club-scoped), so the id is not trusted.
export function RepeatMatchButton({ agreementId }: { agreementId: string }) {
  const t = useTranslations('match.recreate');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function repeat() {
    startTransition(async () => {
      const result = await recreateMatchAction({ agreementId });
      if (result.ok) {
        toast.success(t('created'));
        router.push(`/match/${result.agreementId}` as Route);
        return;
      }
      if (result.code === 'STALE_PARTICIPANT') {
        toast.error(t('staleParticipant', { name: result.memberName ?? '?' }));
      } else {
        toast.error(t('failed'));
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={repeat}
      disabled={isPending}
      aria-busy={isPending ? 'true' : undefined}
      aria-label={t('repeatAria')}
      className="text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-60 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
    >
      <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} aria-hidden />
    </button>
  );
}
