/**
 * Wipe all data from the dev/local database, preserving schema and
 * applied migrations. Used to iterate on first-run flows (notably the
 * spec 008 self-bootstrap path) without manual psql commands.
 *
 *   pnpm db:reset             # truncate every table, schema untouched
 *   pnpm db:reset:bootstrap   # truncate + insert one minimal clubs row
 *                             # (precondition for spec 008 bootstrap;
 *                             # users + members stay empty so the next
 *                             # magic-link sign-in auto-promotes)
 *
 * Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1
 * (or NEON_LOCAL_PROXY_HOST is set). Production DBs are not touchable
 * by this script — destructive ops only against the local stack.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clubBankingProfiles, clubs } from '@/lib/db/schema/clubs';
import { env } from '@/lib/env';

const DEFAULT_CLUB_NAME = 'Bar U Pavla';
const DEFAULT_CLUB_CURRENCY = 'CZK';
const DEFAULT_CLUB_LOCALE = 'cs';

function assertLocalTarget(): void {
  const url = env.DATABASE_URL;
  const looksLocal =
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    Boolean(env.NEON_LOCAL_PROXY_HOST);
  if (!looksLocal) {
    throw new Error(
      `[db:reset] Refusing to run: DATABASE_URL does not look local (${url}). ` +
        'Set NEON_LOCAL_PROXY_HOST or point DATABASE_URL at localhost to enable.',
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('[db:reset] Refusing to run: NODE_ENV=production');
  }
}

async function truncateAllTables(): Promise<number> {
  // Two-step truncate: enumerate every table in the public schema
  // (excluding drizzle's migration bookkeeping so we don't re-run
  // migrations on next boot), then issue one TRUNCATE ... RESTART
  // IDENTITY CASCADE that wipes them and resets serials together.
  // Done as two execute calls because the Neon driver chokes on
  // multi-statement DO blocks, and underscore is a LIKE wildcard so
  // we exclude by exact name instead.
  const listed = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '__drizzle_migrations'
  `);
  const tables = listed.rows.map((r) => r.tablename);
  if (tables.length === 0) return 0;
  const quoted = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
  return tables.length;
}

async function insertMinimalClub(): Promise<void> {
  const [club] = await db
    .insert(clubs)
    .values({
      name: DEFAULT_CLUB_NAME,
      currencyCode: DEFAULT_CLUB_CURRENCY,
      defaultLocale: DEFAULT_CLUB_LOCALE,
    })
    .returning();
  if (!club) throw new Error('Failed to insert default club');
  await db.insert(clubBankingProfiles).values({ clubId: club.id });
  console.log(
    `[db:reset] Inserted minimal club ${club.id} ` +
      `(${club.name}, ${club.currencyCode}, ${club.defaultLocale})`,
  );
}

async function main(): Promise<void> {
  assertLocalTarget();

  const withClub = process.argv.includes('--with-club');

  const count = await truncateAllTables();
  console.log(`[db:reset] Truncated ${count} table(s) in public schema`);

  if (withClub) {
    await insertMinimalClub();
    console.log(
      '[db:reset] Ready for spec 008 bootstrap: users + members are empty, ' +
        'one clubs row exists. Open /sign-in to claim club_admin.',
    );
  } else {
    console.log('[db:reset] DB is bare (no clubs row). Use --with-club to seed one.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[db:reset] Failed:', err);
    process.exit(1);
  });
