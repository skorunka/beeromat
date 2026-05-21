// Next.js 16 renames middleware.ts to proxy.ts. The file exports a
// proxy() function with the same signature as the old middleware()
// function. next-intl's middleware handles locale detection +
// redirection (e.g. browser language → /cs or /en prefix).

import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from '@/lib/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest): NextResponse {
  // Honour a remembered locale choice for unprefixed paths. The
  // language switcher writes the NEXT_LOCALE cookie; localeDetection
  // stays off, so this never sniffs Accept-Language — only an explicit
  // prior choice sends a member to /en. Czech (the default) needs no
  // prefix, so a `cs` cookie is a no-op.
  const { pathname } = request.nextUrl;
  const hasLocalePrefix = /^\/(cs|en)(\/|$)/.test(pathname);
  if (!hasLocalePrefix && request.cookies.get('NEXT_LOCALE')?.value === 'en') {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname}`;
    return NextResponse.redirect(url);
  }
  return intlMiddleware(request);
}

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
