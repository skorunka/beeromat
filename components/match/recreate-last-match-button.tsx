'use client';

import { useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import { recreateLastMatchAction } from '@/app/[locale]/(app)/match/actions';

// Spec 027 — one-tap "Recreate last match" control on the /match hub.
// Labelled with the matchup it will clone so the member knows what
// they're recreating before tapping. The action takes no input (it
// re-resolves the source server-side); this button only triggers it
// and navigates to the new agreement on success.
export function RecreateLastMatchButton({ sideA, sideB }: { sideA: string; sideB: string }) {
  const t = useTranslations('match.recreate');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function recreate() {
    startTransition(async () => {
      const result = await recreateLastMatchAction();
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
      onClick={recreate}
      disabled={isPending}
      aria-busy={isPending ? 'true' : undefined}
      className="border-input bg-background hover:bg-accent disabled:opacity-60 flex min-h-12 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
    >
      <RefreshCw className="text-primary h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="text-muted-foreground">{t('label')} </span>
        <span className="font-medium">
          {sideA} <span className="text-muted-foreground">vs</span> {sideB}
        </span>
      </span>
    </button>
  );
}
