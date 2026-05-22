// v1.2 forms hardening — shared schemas for the money forms.
//
// These validate the *form* input — a major-unit amount string the member
// types. The Server Actions receive minor units across the client boundary
// and keep their own minor-unit boundary check (FR-005); `toMinor` is the
// shared bridge between the two representations.

import { z } from 'zod';

import { formMessages } from './messages';
import { toMinor } from './money';

/** A major-unit money string that parses to a positive minor-unit amount. */
const positiveAmount = z
  .string()
  .trim()
  .refine(
    (v) => {
      const minor = toMinor(v);
      return minor !== null && minor > 0n;
    },
    { error: 'settle.invalidAmount' },
  );

/** Settle "paid another way" — amount plus a mandatory note (the treasurer
 *  needs context when confirming an out-of-band payment). */
export const paidOtherMethodSchema = z.object({
  amount: positiveAmount,
  note: z.string().trim().min(1, { error: 'settle.noteRequired' }),
});
export type PaidOtherMethodValues = z.infer<typeof paidOtherMethodSchema>;

/** Treasurer manual payment — amount plus an optional note. */
export const manualPaymentSchema = z.object({
  amount: positiveAmount,
  note: z.string().trim().max(500, { error: formMessages.tooLong }),
});
export type ManualPaymentValues = z.infer<typeof manualPaymentSchema>;
