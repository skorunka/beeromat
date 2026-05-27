// v1.2 forms hardening — shared schemas for the auth & onboarding forms.
//
// One schema per form, the single source of validation truth for both the
// client react-hook-form resolver and (where wired) the Server Action. Every
// fallible constraint emits a catalog message key, never literal text.

import { z } from 'zod';

import { formMessages } from './messages';

/** Pragmatic email shape — matches the server's `email.includes('@')` gate
 *  but a little stricter; the client never submits what the server rejects. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A device PIN is exactly four digits — the canonical rule mirrored by
 *  `isValidPinFormat` in lib/auth/pin (server side). */
const PIN_RE = /^\d{4}$/;

/** Sign-in form — the email-entry step. */
export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: formMessages.required })
    .regex(EMAIL_RE, { error: formMessages.email }),
});
export type SignInValues = z.infer<typeof signInSchema>;

/** PIN unlock — a single 4-digit field. */
export const pinUnlockSchema = z.object({
  pin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
});
export type PinUnlockValues = z.infer<typeof pinUnlockSchema>;

/** PIN setup — a 4-digit field plus a confirmation that must match it.
 *  The cross-field mismatch is attached to `confirmPin` so it renders
 *  beside the confirmation input (FR-011). */
export const pinSetupSchema = z
  .object({
    pin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
    confirmPin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
  })
  .refine((v) => v.pin === v.confirmPin, {
    error: 'pin.setup.mismatch',
    path: ['confirmPin'],
  });
export type PinSetupValues = z.infer<typeof pinSetupSchema>;

/** Change PIN — current + new + confirm-new. Same cross-field
 *  mismatch rule as setup. The server action (setPinAction with
 *  `currentPin` set) verifies the current PIN against the stored
 *  hash and returns WRONG_CURRENT_PIN if it doesn't match. */
export const pinChangeSchema = z
  .object({
    currentPin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
    pin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
    confirmPin: z.string().regex(PIN_RE, { error: 'pin.setup.invalidFormat' }),
  })
  .refine((v) => v.pin === v.confirmPin, {
    error: 'pin.setup.mismatch',
    path: ['confirmPin'],
  });
export type PinChangeValues = z.infer<typeof pinChangeSchema>;
