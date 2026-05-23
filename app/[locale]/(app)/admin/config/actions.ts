'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/auth/session';
import { updateClubFieldsTx } from '@/lib/db/queries/club-config';
import { clubConfigSchema } from '@/lib/validation/admin-config';

// Spec 008 contracts/admin-config.md §1 — updateClubConfig.
//
// Edits the three club-row fields exposed in /admin/config: name,
// currencyCode, defaultLocale. Banking-profile edits continue to
// flow through the existing updateBankingProfileAction (spec 001 /
// admin/settings/banking) — v1.8's /admin/config composes BOTH
// forms on one page without duplicating the banking validation.

export type UpdateClubConfigResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' };

export async function updateClubConfigAction(
  rawInput: unknown,
): Promise<UpdateClubConfigResult> {
  // Defensive RBAC seatbelt — the /admin/config page also guards at
  // load time, but the action layer is the authoritative boundary.
  let ctx;
  try {
    ctx = await requireRole('club_admin');
  } catch {
    return { ok: false, code: 'FORBIDDEN' };
  }

  const parsed = clubConfigSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  await updateClubFieldsTx(parsed.data, ctx.club.id);

  // The club name renders on the admin hub + every screen that shows
  // branding; currency code affects every money-display screen via
  // Intl.NumberFormat; default locale affects new visitors without an
  // explicit cookie preference. Revalidate broadly.
  revalidatePath('/admin/config');
  revalidatePath('/admin');
  revalidatePath('/', 'layout');
  return { ok: true };
}
