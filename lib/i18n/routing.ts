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
});

export type Locale = (typeof routing.locales)[number];
