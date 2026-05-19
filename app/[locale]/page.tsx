import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('app');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-center text-lg">{t('tagline')}</p>
    </main>
  );
}
