// Spec 012 — schema for the /match log form.
import { z } from 'zod';

export const logMatchSchema = z.object({
  opponentMemberId: z.string().uuid({ error: 'match.errors.opponentRequired' }),
  outcome: z.enum(['won', 'lost'], { error: 'match.errors.outcomeRequired' }),
});

export type LogMatchInput = z.infer<typeof logMatchSchema>;
