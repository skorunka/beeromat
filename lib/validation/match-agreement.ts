// Spec 013 — Zod schemas for the pre-match agreement flow.
//
// Singles agreements have exactly 2 distinct members (one per side,
// seat 1) and NO pairingKind. Doubles agreements have exactly 4
// distinct members (2 per side, seats 1+2) AND a pairingKind picked
// explicitly by the creator (no implicit default — per the Q4
// clarification). Schemas are reused on the server (authoritative
// validation in actions.ts) and the client (react-hook-form
// resolver), per the constitution's User Input & Forms standard.
import { z } from 'zod';

export const matchFormatSchema = z.enum(['singles', 'doubles'], {
  error: 'match.errors.formatInvalid',
});

export const pairingKindSchema = z.enum(['straight', 'crossed'], {
  error: 'match.errors.pairingInvalid',
});

export const winningSideSchema = z.enum(['A', 'B'], {
  error: 'match.errors.winningSideInvalid',
});

const memberIdSchema = z.string().uuid({ error: 'match.errors.memberRequired' });

const singlesSidesSchema = z.object({
  A: z.object({ seat1: memberIdSchema }),
  B: z.object({ seat1: memberIdSchema }),
});

const doublesSidesSchema = z.object({
  A: z.object({ seat1: memberIdSchema, seat2: memberIdSchema }),
  B: z.object({ seat1: memberIdSchema, seat2: memberIdSchema }),
});

// Collect every member id appearing in `sides` regardless of format —
// used by the all-distinct refinement below.
function collectMemberIds(
  sides:
    | z.infer<typeof singlesSidesSchema>
    | z.infer<typeof doublesSidesSchema>,
): string[] {
  const ids: string[] = [sides.A.seat1, sides.B.seat1];
  if ('seat2' in sides.A) ids.push(sides.A.seat2);
  if ('seat2' in sides.B) ids.push(sides.B.seat2);
  return ids;
}

export const createAgreementSchema = z
  .discriminatedUnion('format', [
    z.object({
      format: z.literal('singles'),
      forBeer: z.boolean({ error: 'match.errors.forBeerRequired' }),
      sides: singlesSidesSchema,
      pairingKind: z.undefined({ error: 'match.errors.pairingNotAllowed' }).optional(),
      // Spec 030 — the beer the match is for (chosen at create when
      // forBeer). Null/omitted otherwise; delivery falls back if unset.
      betBeerTypeId: z.string().uuid().nullable().optional(),
    }),
    z.object({
      format: z.literal('doubles'),
      forBeer: z.boolean({ error: 'match.errors.forBeerRequired' }),
      sides: doublesSidesSchema,
      pairingKind: pairingKindSchema,
      betBeerTypeId: z.string().uuid().nullable().optional(),
    }),
  ])
  .superRefine((data, ctx) => {
    const ids = collectMemberIds(data.sides);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'match.errors.duplicateMember',
          path: ['sides'],
        });
        return;
      }
      seen.add(id);
    }
  });

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;

// Editing accepts the same shape as creation. Lineup, pairing, and
// for-beer flag are all editable on an OPEN agreement; FR-013 blocks
// edits once recorded.
export const editAgreementSchema = z.object({
  agreementId: z.string().uuid({ error: 'match.errors.agreementIdRequired' }),
  patch: createAgreementSchema,
});

export type EditAgreementInput = z.infer<typeof editAgreementSchema>;

export const cancelAgreementSchema = z.object({
  agreementId: z.string().uuid({ error: 'match.errors.agreementIdRequired' }),
});

export type CancelAgreementInput = z.infer<typeof cancelAgreementSchema>;

export const recordResultSchema = z.object({
  agreementId: z.string().uuid({ error: 'match.errors.agreementIdRequired' }),
  winningSide: winningSideSchema,
  // Spec 018 — optional beer-type override for the auto-created
  // winner consumption. When omitted, the action picks the
  // winner's last-beer (or cheapest in-stock fallback).
  betBeerOverrideId: z.string().uuid().optional(),
});

export type RecordResultInput = z.infer<typeof recordResultSchema>;

export const reverseResultSchema = z.object({
  agreementId: z.string().uuid({ error: 'match.errors.agreementIdRequired' }),
});

export type ReverseResultInput = z.infer<typeof reverseResultSchema>;
