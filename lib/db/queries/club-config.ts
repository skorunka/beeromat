import 'server-only';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clubs, clubBankingProfiles } from '@/lib/db/schema/clubs';
import type { ClubConfigInput } from '@/lib/validation/admin-config';

// Spec 008 — typed reads + writes for the club-config admin surface.
//
// getClubConfig joins the single clubs row with its optional banking
// profile so the /admin/config page renders both sections from one
// query. updateClubFieldsTx is the focused write for the club row
// (name + currencyCode + defaultLocale); banking writes continue to
// flow through the existing updateBankingProfileAction
// (app/[locale]/(app)/admin/settings/actions.ts).

export interface ClubConfigSnapshot {
  id: string;
  name: string;
  currencyCode: string;
  defaultLocale: string;
}

export async function getClubConfig(clubId: string): Promise<ClubConfigSnapshot | null> {
  const row = await db.query.clubs.findFirst({
    where: eq(clubs.id, clubId),
    columns: {
      id: true,
      name: true,
      currencyCode: true,
      defaultLocale: true,
    },
  });
  return row ?? null;
}

export async function updateClubFieldsTx(
  input: ClubConfigInput,
  clubId: string,
): Promise<void> {
  await db
    .update(clubs)
    .set({
      name: input.name,
      currencyCode: input.currencyCode,
      defaultLocale: input.defaultLocale,
    })
    .where(eq(clubs.id, clubId));
}

// Re-export for the page server-component that wants both forms'
// data without two round trips. Banking is loaded inline; this is
// a tiny join, not a generic relations helper.
export async function getClubConfigWithBanking(clubId: string) {
  const config = await getClubConfig(clubId);
  if (!config) return null;
  const banking = await db.query.clubBankingProfiles.findFirst({
    where: eq(clubBankingProfiles.clubId, clubId),
  });
  return { config, banking: banking ?? null };
}
