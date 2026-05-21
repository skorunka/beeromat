'use server';

import { cookies } from 'next/headers';

import { routing } from './routing';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persist a member's explicit locale choice in the NEXT_LOCALE cookie.
 * proxy.ts honours it for unprefixed paths on later visits — so the
 * choice survives between visits without sniffing the browser language.
 */
export async function setLocaleCookie(locale: string): Promise<void> {
  if (!(routing.locales as readonly string[]).includes(locale)) return;
  (await cookies()).set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });
}
