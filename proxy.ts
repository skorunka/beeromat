// Next.js 16 renames middleware.ts to proxy.ts. The file exports a
// proxy() function with the same signature as the old middleware()
// function. next-intl's middleware handles locale detection +
// redirection (e.g. browser language → /cs or /en prefix).

import createMiddleware from 'next-intl/middleware';

import { routing } from '@/lib/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all paths except: api, _next/static, _next/image, favicon, the
  // root-level metadata icon routes (`/icon`, `/apple-icon` — they carry
  // no locale and must not be rewritten into the [locale] tree), and any
  // file with an extension. The auth API mount at /api/auth is excluded
  // so Better Auth's callbacks aren't double-handled.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|icon|apple-icon|.*\\..*).*)',
  ],
};
