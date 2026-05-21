import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';

// In-locale not-found: a valid locale, a path with no route. Renders
// inside the [locale] layout (which provides <html>/<body>), so it can
// use the catalog.
export default async function LocaleNotFound() {
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-bold">404</p>
      <h1 className="text-xl font-semibold">{t('errors.notFound')}</h1>
      <Link href={'/' as Route} className="text-primary text-sm underline">
        {t('common.backHome')}
      </Link>
    </main>
  );
}
