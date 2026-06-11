'use client';

// Route-segment error boundary for the whole [locale] subtree. Next.js
// renders this in place of a page that throws during render. It sits
// inside [locale]/layout, so the NextIntlClientProvider is still mounted
// and translations work. Errors thrown by the layout itself escape to
// app/global-error.tsx (which can't use i18n — it replaces the root).

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Surface the digest in the browser console so a report ("I got an
    // error") can be correlated with the server-side stack Next logs
    // under the same digest.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <BrandMark />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('boundaryTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('boundaryBody')}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" className="h-14 text-lg" onClick={() => reset()}>
          {t('boundaryRetry')}
        </Button>
        {/* Hard navigation, not a client Link: the React tree is in an
            errored state, so a full document load is the most reliable
            way back to a clean home. */}
        <Button variant="ghost" render={<a href="/" />}>
          {t('boundaryHome')}
        </Button>
      </div>
    </main>
  );
}
