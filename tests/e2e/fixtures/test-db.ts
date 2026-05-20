import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from '@/lib/db/schema';
import { clubBankingProfiles, clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';

// E2E test-DB lifecycle.
//
// This fixture is TEST INFRASTRUCTURE (lives under tests/, never
// imported by production code). It connects DIRECTLY to the local
// Docker Postgres — bypassing the Neon HTTP proxy — because the proxy
// adds ~450ms latency per query, which makes a ~70-statement migration
// take ~35s. The app-under-test still uses the proxy (the production
// code path); only test setup/teardown uses this direct connection.
// This is NOT a prod driver-swap: production lib/db/client.ts is
// untouched and uses neon-http exclusively.
//
// Lifecycle:
//   globalSetup    → applyMigrations(): DROP SCHEMA + migrate fresh
//                    (crash-safe — recovers from any prior partial run)
//   beforeEach     → resetAndSeedTestDb(): truncate + reseed
//   globalTeardown → wipeTestDb(): truncate, leaving the DB clean

const PRESERVE_TABLES = new Set(['__drizzle_migrations']);

export interface TestDbSeed {
  club: { id: string; name: string };
  admin: { id: string; userId: string; email: string };
}

type Db = NodePgDatabase<typeof schema>;

/**
 * Guard: the fixture performs destructive operations (DROP SCHEMA,
 * TRUNCATE). It MUST only ever run against a local Docker Postgres.
 * Refuse any non-loopback host so a misconfigured env can never wipe
 * a real database.
 */
function assertLoopback(directUrl: string): void {
  let host: string;
  try {
    host = new URL(directUrl).hostname;
  } catch {
    throw new Error('test-db: TEST_DATABASE_DIRECT_URL is not a valid URL');
  }
  if (!['localhost', '127.0.0.1', '::1', 'db.localtest.me'].includes(host)) {
    throw new Error(
      `test-db: refusing to operate — host "${host}" is not loopback. ` +
        'The test fixture only ever touches the local Docker Postgres.',
    );
  }
}

async function withDb<T>(directUrl: string, fn: (db: Db) => Promise<T>): Promise<T> {
  assertLoopback(directUrl);
  const pool = new Pool({ connectionString: directUrl });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    return await fn(db);
  } finally {
    await pool.end();
  }
}

/**
 * Crash-safe schema reset. DROP SCHEMA wipes everything — including
 * __drizzle_migrations and any partial state from a prior failed run —
 * then migrations are applied fresh. Called once by Playwright's
 * globalSetup.
 */
export async function applyMigrations(directUrl: string): Promise<void> {
  await withDb(directUrl, async (db) => {
    await db.execute(sql.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  });
}

async function truncateAll(db: Db): Promise<void> {
  // Discover all current public-schema tables at runtime so new
  // migrations (US2 payments, US6 bets, …) are picked up automatically.
  const result = await db.execute<{ tablename: string }>(
    sql.raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"),
  );
  const names = result.rows.map((r) => r.tablename).filter((t) => !PRESERVE_TABLES.has(t));
  if (names.length === 0) return;
  const list = names.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}

async function seedRows(db: Db, e: NodeJS.ProcessEnv): Promise<TestDbSeed> {
  const [club] = await db
    .insert(clubs)
    .values({
      name: e.SEED_CLUB_NAME ?? 'Test Club',
      currencyCode: e.SEED_CLUB_CURRENCY ?? 'CZK',
      defaultLocale: e.SEED_CLUB_LOCALE ?? 'cs-CZ',
    })
    .returning();
  if (!club) throw new Error('seed: club insert returned no row');

  await db.insert(clubBankingProfiles).values({ clubId: club.id });

  const [user] = await db
    .insert(users)
    .values({
      email: e.SEED_ADMIN_EMAIL ?? 'admin@example.test',
      name: e.SEED_ADMIN_NAME ?? 'Test Admin',
      emailVerified: true,
    })
    .returning();
  if (!user) throw new Error('seed: user insert returned no row');

  const [member] = await db
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: user.name,
      role: 'club_admin',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  if (!member) throw new Error('seed: member insert returned no row');

  return {
    club: { id: club.id, name: club.name },
    admin: { id: member.id, userId: user.id, email: user.email },
  };
}

/**
 * Truncate + reseed the base state (one club + admin). Call from a
 * spec's beforeEach. Schema is assumed already applied by globalSetup.
 */
export async function resetAndSeedTestDb(directUrl: string): Promise<TestDbSeed> {
  return withDb(directUrl, async (db) => {
    await truncateAll(db);
    return seedRows(db, process.env);
  });
}

/**
 * Wipe every row, leaving the DB clean. Called by globalTeardown
 * ("destroy DB after test end"). Schema is preserved.
 */
export async function wipeTestDb(directUrl: string): Promise<void> {
  await withDb(directUrl, (db) => truncateAll(db));
}

/** Read-only helper: confirm a row exists for a known member email. */
export async function findMemberByEmail(
  directUrl: string,
  email: string,
): Promise<{ id: string; clubId: string } | null> {
  return withDb(directUrl, async (db) => {
    const row = await db.query.members.findFirst({ where: eq(members.email, email) });
    return row ? { id: row.id, clubId: row.clubId } : null;
  });
}
