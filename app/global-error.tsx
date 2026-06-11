'use client';

// Last-resort boundary: Next.js renders this only when an error escapes
// the root layout itself (or [locale]/layout, before its providers
// mount). It REPLACES the root layout, so it must ship its own
// <html>/<body>, and it lives outside NextIntlClientProvider + the
// globals.css cascade — hence hardcoded Czech (the default locale) and
// inline styles. The common case (a page throws) is caught by the
// branded, localized app/[locale]/error.tsx instead.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="cs">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#b5701a',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            fontSize: '0.75rem',
          }}
        >
          <span aria-hidden>🍺</span>
          <span>beeromat</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Něco se rozlilo.
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#78716c', margin: 0 }}>
            Promiň, tady něco spadlo. Zkus to prosím znovu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            height: '3.5rem',
            padding: '0 1.5rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#fff',
            background: '#b5701a',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Zkusit znovu
        </button>
      </body>
    </html>
  );
}
