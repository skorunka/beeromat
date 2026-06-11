'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { generateOccurrencesAction } from '@/app/[locale]/(app)/events/actions';

// Spec 032 — admin runs occurrence generation now (same idempotent job the
// nightly cron runs), without waiting until 02:00. Authenticated as the
// admin, so no CRON_SECRET needed.
export function GenerateOccurrencesButton() {
  const t = useTranslations('events.admin');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await generateOccurrencesAction();
      if (r.ok) toast.success(t('generatedToast', { count: r.created }));
      router.refresh();
    });
  }

  return (
    <Button variant="outline" onClick={run} disabled={isPending} isPending={isPending}>
      <RefreshCw className="h-4 w-4" aria-hidden />
      {t('generateNow')}
    </Button>
  );
}
