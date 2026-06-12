import { z } from 'zod';

// Spec 033 — log-a-round batch validation. Shared by the round-logger
// (client intent) and the server-authoritative logRoundAction. A round
// is a list of {drinker, beer} items; the drinker pays for their own
// beer (each item becomes one consumption on that member's tab).

export const roundItemSchema = z.object({
  memberId: z.string().uuid(),
  beerTypeId: z.string().uuid(),
});

export const logRoundSchema = z.object({
  // At least one drinker; the UI disables submit at zero, this is the
  // server seatbelt.
  items: z
    .array(roundItemSchema)
    .min(1, { error: 'round.errors.empty' })
    // One beer per drinker per round (FR-012) — reject a repeated member.
    .refine((items) => new Set(items.map((i) => i.memberId)).size === items.length, {
      error: 'round.errors.duplicateMember',
    }),
});

export type RoundItem = z.infer<typeof roundItemSchema>;
export type LogRoundInput = z.infer<typeof logRoundSchema>;
