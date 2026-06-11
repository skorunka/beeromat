import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Bricolage_Grotesque } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import { BeerCelebration } from '@/components/log/beer-celebration';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { routing } from '@/lib/i18n/routing';

import '../globals.css';

export const metadata: Metadata = {
  title: 'beeromat',
  description: 'After-match beer tab tracker for tennis clubs',
  // PWA: declare the manifest + iOS standalone behaviour (Android reads
  // the manifest directly; iOS Safari needs these apple-specific hints
  // to launch full-screen from the home screen with the right title +
  // status-bar treatment).
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'beeromat',
    statusBarStyle: 'default',
  },
};

// `viewportFit: 'cover'` lets content (and the bottom nav's
// `env(safe-area-inset-bottom)` padding) extend into the iOS notch /
// home-indicator regions. Without it those insets report 0 and the
// fixed bottom nav sits under the home indicator. Zoom is left enabled
// (no maximumScale / userScalable) so pinch-to-zoom stays available.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
          <BeerCelebration />
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
