// Spec 010 — Zod schema for the /account display-name form.
//
// Single field; trim then length ∈ [1, 80]. Errors emit catalog
// keys per the v1.2 forms-hardening convention; the client and
// server actions share this schema.

import { z } from 'zod';

export const accountSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'account.errors.displayNameRequired' })
    .max(80, { error: 'account.errors.displayNameTooLong' }),
});

export type AccountInput = z.infer<typeof accountSchema>;
