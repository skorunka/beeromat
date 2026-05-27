import { z } from 'zod';

// Spec 022 — drink-session title shape.
//
// 60 chars after trim is enough for phrases like "Středeční debly s
// Pardubicema 6-2" (~32 chars) while still fitting a /history row
// card on a 360px-wide phone without truncation in the common case.
//
// Trim + empty→null normalization happens inside the schema so the
// server action receives a clean `string | null` regardless of how
// the client sent it. The same schema is reused for client-side
// max-length validation in the inline-edit input.

export const SESSION_TITLE_MAX_LENGTH = 60;

export const sessionTitleSchema = z
  .string()
  .trim()
  .max(SESSION_TITLE_MAX_LENGTH)
  .transform((v) => (v.length === 0 ? null : v));

export type SessionTitleInput = z.infer<typeof sessionTitleSchema>;
