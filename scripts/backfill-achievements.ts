/**
 * Spec 035 — one-off achievements backfill.
 *
 *   pnpm tsx scripts/backfill-achievements.ts
 *
 * Awards every currently-qualifying badge to every member of every club,
 * stamping newly-inserted rows with a SINGLE release timestamp (so historical
 * earns don't read as "unlocked today" — FR-010/FR-013). Insert-if-absent, so
 * it is safe to run more than once. Run once locally after migrating, and once
 * against prod after deploy (DATABASE_URL pointed at prod).
 */
import { db } from '@/lib/db/client';
import { clubs } from '@/lib/db/schema/clubs';
import { reconcileAllClubMembers } from '@/lib/db/queries/achievements';

async function main() {
  // One stamp for the whole backfill run — all historical earns share it.
  const stampAt = new Date();
  const allClubs = await db.select({ id: clubs.id, name: clubs.name }).from(clubs);

  let grandTotal = 0;
  for (const club of allClubs) {
    const inserted = await reconcileAllClubMembers({ clubId: club.id, stampAt });
    grandTotal += inserted;
    console.log(`  ${club.name} (${club.id}): ${inserted} badge(s) awarded`);
  }
  console.log(`Backfill complete — ${grandTotal} badge(s) awarded across ${allClubs.length} club(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
