/**
 * Clear OPERATIONAL data from the dev/local database — matches, bets,
 * logged beers, rounds, and the stock-change audit — while preserving
 * the club, members, beer catalog, banking profile, invitations, and
 * payments. Use when you want to demo / re-test the bet/match flows
 * from a clean sheet without re-onboarding.
 *
 *   pnpm tsx scripts/clear-operational-data.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1
 * (or NEON_LOCAL_PROXY_HOST is set). Production DBs are not touchable.
 *
 * KEPT: clubs, users, members, beer_types, club_banking_profiles,
 *       invitations, payments, payment_state_transitions, device_sessions
 * WIPED: match_bet_transfers, bet_transfer_voids, bet_transfers,
 *        matches, match_agreement_sides, match_agreements,
 *        consumption_voids, consumptions, stock_changes, drink_sessions
 *
 * beer_types.currentStock is NOT reset (the catalog stays as-is); use
 * the admin stock-adjust flow if you want to refill counters too.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

const TABLES_TO_CLEAR = [
  // Order is irrelevant under TRUNCATE ... CASCADE, but listing them
  // explicitly makes the scope auditable.
  'match_bet_transfers',
  'bet_transfer_voids',
  'bet_transfers',
  'matches',
  'match_agreement_sides',
  'match_agreements',
  'consumption_voids',
  'consumptions',
  'stock_changes',
  'drink_sessions',
] as const;

function assertLocalTarget(): void {
  const url = env.DATABASE_URL;
  const looksLocal =
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    Boolean(env.NEON_LOCAL_PROXY_HOST);
  if (!looksLocal) {
    throw new Error(
      `[clear-operational-data] Refusing to run: DATABASE_URL does not look local (${url}).`,
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('[clear-operational-data] Refusing to run: NODE_ENV=production');
  }
}

async function main(): Promise<void> {
  assertLocalTarget();
  const quoted = TABLES_TO_CLEAR.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
  console.log(
    `[clear-operational-data] Wiped ${TABLES_TO_CLEAR.length} tables: ${TABLES_TO_CLEAR.join(', ')}`,
  );
  console.log(
    '[clear-operational-data] Kept: clubs, users, members, beer_types, banking, invitations, payments.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[clear-operational-data] Failed:', err);
    process.exit(1);
  });
