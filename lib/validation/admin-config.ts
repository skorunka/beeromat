// Spec 008 — Zod schema for the club-fields portion of /admin/config.
//
// Banking-profile fields are NOT in this schema — they're covered by
// the existing `bankingProfileSchema` in lib/validation/banking.ts and
// saved through the existing `updateBankingProfileAction` (spec 001 /
// admin/settings/banking). v1.8's /admin/config composes both forms
// on one page without duplicating the banking validation.

import { z } from 'zod';

import { routing } from '@/lib/i18n/routing';
import { formMessages } from './messages';

export const clubConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: formMessages.required })
    .max(120, { error: formMessages.tooLong }),
  // ISO 4217 — three uppercase letters. The server action does no
  // additional currency-code lookup; the regex is the v1.8 gate.
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, { error: 'admin.clubConfig.invalidCurrency' }),
  // Bare-code locale; the existing seed's "cs-CZ" is the legacy form
  // and gets normalised to "cs" by the form / action. Only the
  // routing.locales values are accepted.
  defaultLocale: z.enum(routing.locales as unknown as readonly [string, ...string[]]),
});

export type ClubConfigInput = z.infer<typeof clubConfigSchema>;
