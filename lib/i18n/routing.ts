import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['cs', 'en'] as const,
  defaultLocale: 'cs',
  localePrefix: 'as-needed',
  // The club is Czech: an unprefixed path always serves Czech. Without
  // this, next-intl sniffs the browser's Accept-Language and redirects
  // e.g. `/` → `/en` for an English-configured phone. English stays
  // available explicitly at `/en/…`.
  localeDetection: false,
  // Do NOT let next-intl write the NEXT_LOCALE cookie. By default it
  // sets the cookie to the locale of every page served — so a single
  // visit to an `/en/…` URL would stick the cookie to `en` and then
  // `proxy.ts` would redirect `/` → `/en` forever, even though the
  // member never *chose* English. The cookie must reflect only a
  // deliberate choice: the language switcher's `setLocaleCookie`
  // action is the sole writer; `proxy.ts` is the sole reader.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
