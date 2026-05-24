// Next.js 16 renames middleware.ts to proxy.ts. The file exports a
// proxy() function with the same signature as the old middleware()
// function. next-intl's middleware handles locale detection +
// redirection (e.g. browser language → /cs or /en prefix).
//
// Spec 009 adds a fresh-state redirect: when the deployment is truly
// fresh (no clubs row AND no users row), every non-static request is
// redirected to /<locale>/setup so the very first visitor lands on
// the onboarding wizard. The check goes through isFreshDeployment()
// which is sticky-false-cached after the first observation of a
// populated deployment — so post-bootstrap requests pay zero DB cost.

import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { isFreshDeployment } from '@/lib/db/queries/bootstrap-state';
import { routing } from '@/lib/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const SETUP_PATH_RE = /^\/(?:(cs|en)\/)?setup(?:\/.*)?$/;

function resolveLocale(request: NextRequest): 'cs' | 'en' {
  const prefix = /^\/(cs|en)(?:\/|$)/.exec(request.nextUrl.pathname);
  if (prefix) return prefix[1] as 'cs' | 'en';
  const cookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookie === 'cs' || cookie === 'en') return cookie;
  return routing.defaultLocale;
}

function setupUrlFor(locale: 'cs' | 'en', request: NextRequest): URL {
  const url = request.nextUrl.clone();
  // Czech is the unprefixed default per routing.ts; the english variant
  // is prefixed so the redirect resolves cleanly through next-intl.
  url.pathname = locale === routing.defaultLocale ? '/setup' : `/${locale}/setup`;
  url.search = '';
  return url;
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Spec 009 FR-011 — true-fresh deployments funnel every visitor to
  // the wizard. The check is `false` for the lifetime of any process
  // that has ever seen a populated DB; the typical post-bootstrap
  // path adds ~zero overhead. Runs BEFORE the NEXT_LOCALE redirect so
  // a `cs`-cookie'd visitor on a fresh deploy still lands on /setup,
  // not on / (which would then bounce back).
  if (await isFreshDeployment()) {
    if (!SETUP_PATH_RE.test(pathname)) {
      const locale = resolveLocale(request);
      return NextResponse.redirect(setupUrlFor(locale, request));
    }
    // In-state-X visit to /setup itself — let next-intl render it.
    return intlMiddleware(request);
  }

  // Spec 009 FR-010 — /setup is invisible once bootstrapped. Cookie-
  // presence is the cheap gate (the destination route's layout does
  // full session validation); admin OR regular member, doesn't matter
  // here — the wizard is for fresh installs, not re-configuration.
  if (SETUP_PATH_RE.test(pathname)) {
    const locale = resolveLocale(request);
    const url = request.nextUrl.clone();
    url.search = '';
    const hasSession = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('better-auth.session'));
    if (hasSession) {
      url.pathname = locale === routing.defaultLocale ? '/' : `/${locale}`;
    } else {
      url.pathname = locale === routing.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
    }
    return NextResponse.redirect(url);
  }

  // Honour a remembered locale choice for unprefixed paths. The
  // language switcher writes the NEXT_LOCALE cookie; localeDetection
  // stays off, so this never sniffs Accept-Language — only an explicit
  // prior choice sends a member to /en. Czech (the default) needs no
  // prefix, so a `cs` cookie is a no-op.
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
