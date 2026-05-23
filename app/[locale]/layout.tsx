import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Bricolage_Grotesque } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/lib/i18n/routing';

import '../globals.css';

export const metadata: Metadata = {
  title: '🍺 beeromat',
  description: 'After-match beer tab tracker for tennis clubs',
};

// The Clubhouse display typeface (v1.4). `latin-ext` carries the Czech
// diacritics; `swap` + a system fallback means a slow font never blocks
// or shifts text. Exposed as the --font-bricolage CSS variable on
// <html>; globals.css applies it to <body> and the app inherits it.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-bricolage',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} className={bricolage.variable}>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
