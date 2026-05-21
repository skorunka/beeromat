import type { Metadata, Route } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = { title: 'beeromat' };

// Global not-found. Renders for requests that resolve to no locale —
// the [locale] layout calls notFound() before emitting its <html>/<body>,
// so this fallback lands in the bare root layout and must therefore
// render a complete document itself. There is no locale context here,
// so the copy is the deployment-default language (Czech).
export default function NotFound() {
  return (
    <html lang="cs">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-5xl font-bold">404</p>
          <h1 className="text-xl font-semibold">Stránka nenalezena</h1>
          <Link href={'/' as Route} className="text-primary text-sm underline">
            Zpět na úvod
          </Link>
        </main>
      </body>
    </html>
  );
}
