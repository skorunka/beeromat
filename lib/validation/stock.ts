// v1.2 forms hardening — shared schemas for the restock / stock-adjust forms.

import { z } from 'zod';

import { formMessages } from './messages';

/** Restock — a positive whole quantity plus an optional note. */
export const restockSchema = z.object({
  quantity: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) > 0, { error: 'admin.invalidQuantity' }),
  reason: z.string().trim().max(500, { error: formMessages.tooLong }),
});
export type RestockValues = z.infer<typeof restockSchema>;

/** Stock adjust — a non-zero signed integer delta plus a mandatory reason. */
export const adjustSchema = z.object({
  delta: z
    .string()
    .trim()
    .refine((v) => /^-?\d+$/.test(v) && Number(v) !== 0, { error: 'admin.invalidDelta' }),
  reason: z
    .string()
    .trim()
    .min(1, { error: 'admin.adjustReasonRequired' })
    .max(500, { error: formMessages.tooLong }),
});
export type AdjustValues = z.infer<typeof adjustSchema>;
