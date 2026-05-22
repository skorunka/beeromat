// v1.2 forms hardening — shared schema for the club banking-profile form.

import { z } from 'zod';

import { formMessages } from './messages';
import { isValidIban, normalizeIban } from '@/lib/qr-platba/iban';

/**
 * IBAN field: an empty value is allowed (it clears the IBAN, disabling
 * member self-pay); a non-empty value must be structurally valid and pass
 * the mod-97 checksum. The checksum reuses the same `isValidIban` the
 * Server Action uses — one definition of "a valid IBAN", shared.
 */
const ibanField = z.string().trim().refine(
  (v) => {
    if (v === '') return true;
    const normalized = normalizeIban(v);
    return (
      /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized) &&
      normalized.length >= 15 &&
      normalized.length <= 34 &&
      isValidIban(normalized)
    );
  },
  { error: 'admin.invalidIban' },
);

/** Club banking profile — all fields optional; empty clears a field. */
export const bankingProfileSchema = z.object({
  iban: ibanField,
  accountHolderName: z.string().trim().max(120, { error: formMessages.tooLong }),
  revolutHandle: z.string().trim().max(120, { error: formMessages.tooLong }),
  defaultQrMessage: z.string().trim().max(60, { error: formMessages.tooLong }),
});
export type BankingProfileValues = z.infer<typeof bankingProfileSchema>;
