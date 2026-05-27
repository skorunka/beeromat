'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/session';
import { clubBankingProfiles } from '@/lib/db/schema/clubs';
import { isValidIban, normalizeIban } from '@/lib/qr-platba/iban';

// contracts/admin.md → updateBankingProfile.

const patchSchema = z.object({
  // Spec 027 polish — accept spaces + lower-case (the way users
  // paste from bank apps). preprocess() strips ALL whitespace and
  // upper-cases before the structural regex + length checks. The
  // server-side normalizeIban() then runs again for belt-and-
  // braces consistency before the mod-97 checksum.
  iban: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : v),
      z
        .string()
        .min(15)
        .max(34)
        .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
    )
    .nullable()
    .optional(),
  accountHolderName: z.string().max(120).nullable().optional(),
  revolutHandle: z.string().max(120).nullable().optional(),
  defaultQrMessage: z.string().max(60).nullable().optional(),
});

export type UpdateBankingResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_IBAN' | 'INVALID_INPUT' };

/**
 * Edit the club banking profile. Whether `iban` is null toggles member
 * self-pay availability (FR-038). The IBAN is checked with a mod-97
 * checksum on top of the structural regex.
 */
export async function updateBankingProfileAction(
  rawPatch: unknown,
): Promise<UpdateBankingResult> {
  const ctx = await requireRole('club_admin');

  const parsed = patchSchema.safeParse(rawPatch);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const patch = parsed.data;

  const normalizedIban =
    patch.iban != null ? normalizeIban(patch.iban) : patch.iban;
  if (typeof normalizedIban === 'string' && !isValidIban(normalizedIban)) {
    return { ok: false, code: 'INVALID_IBAN' };
  }

  // Only the keys actually present in the patch are written.
  const set: Record<string, unknown> = { updatedByUserId: ctx.user.id };
  if ('iban' in patch) set.iban = normalizedIban;
  if ('accountHolderName' in patch) set.accountHolderName = patch.accountHolderName;
  if ('revolutHandle' in patch) set.revolutHandle = patch.revolutHandle;
  if ('defaultQrMessage' in patch) set.defaultQrMessage = patch.defaultQrMessage;

  await db
    .insert(clubBankingProfiles)
    .values({ clubId: ctx.club.id, ...set })
    .onConflictDoUpdate({ target: clubBankingProfiles.clubId, set });

  revalidatePath('/admin/settings/banking');
  revalidatePath('/settle');
  return { ok: true };
}
