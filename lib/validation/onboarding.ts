// Spec 009 — Zod schema for the fresh-install onboarding wizard at /setup.
//
// Composes spec 008's clubConfigSchema (club name + currency + default
// locale) and adds the admin email. Currency input is permissive of
// case at the wizard layer (per research.md §6 — Pavel on a phone
// shouldn't fail on `czk` vs `CZK`); the transform uppercases before
// the regex check, so the persisted value is canonical.

import { z } from 'zod';

import { routing } from '@/lib/i18n/routing';

/** Match the existing auth-form regex — what the client submits is what
 *  the server (and Better Auth) accepts. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onboardingSchema = z.object({
  clubName: z
    .string()
    .trim()
    .min(1, { error: 'onboarding.errors.clubNameRequired' })
    .max(120, { error: 'onboarding.errors.clubNameTooLong' }),
  currencyCode: z
    .string()
    .trim()
    .min(1, { error: 'onboarding.errors.currencyRequired' })
    .transform((v) => v.toUpperCase())
    .pipe(
      z.string().regex(/^[A-Z]{3}$/, {
        error: 'onboarding.errors.currencyInvalid',
      }),
    ),
  defaultLocale: z.enum(routing.locales as unknown as readonly [string, ...string[]], {
    error: 'onboarding.errors.defaultLocaleInvalid',
  }),
  adminEmail: z
    .string()
    .trim()
    .min(1, { error: 'onboarding.errors.adminEmailRequired' })
    .transform((v) => v.toLowerCase())
    .pipe(
      z.string().regex(EMAIL_RE, { error: 'onboarding.errors.adminEmailInvalid' }),
    ),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
