import path from 'node:path';
import { neon, neonConfig } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

import * as schema from '@/lib/db/schema';
import { clubBankingProfiles, clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';

// E2E test-DB lifecycle. Per the constitutional Test/Prod Code
// Separation rule, this fixture lives OUTSIDE production source
// (under tests/). It uses the SAME @neondatabase/serverless driver
// the app uses, routed through the local proxy via .env.test's
// NEON_FETCH_ENDPOINT — so the production code path is exercised
// end-to-end.
//
// On first call within a test run: applies every drizzle/ migration
// via Drizzle's built-in migrator (creates the __drizzle_migrations
// tracking table; subsequent calls are no-ops).
//
// Before each test scenario: truncates every domain + Better Auth
// table in dependency-safe order using CASCADE, then re-seeds the
// single v1 club + admin from the SEED_* env vars.

// Drizzle's migration tracking table — never truncate this, or
// migrations will be reapplied (causing dup-key errors on the
// __drizzle_migrations row).
const PRESERVE_TABLES = new Set(['__drizzle_migrations']);

export interface TestDbSeed {
  club: { id: string; name: string };
  admin: { id: string; userId: string; email: string };
}

type Db = NeonHttpDatabase<typeof schema>;

let migrationsApplied = false;

function makeDb(connectionString: string): Db {
  // Mirror lib/db/client.ts: honour the fetchEndpoint override so the
  // fixture talks to the same local proxy as the app.
  if (process.env.NEON_FETCH_ENDPOINT) {
    neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
  }
  const client = neon(connectionString);
  return drizzle({ client, schema, casing: 'snake_case' });
}

async function ensureMigrationsApplied(db: Db): Promise<void> {
  if (migrationsApplied) return;
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  migrationsApplied = true;
}

async function truncateAll(db: Db): Promise<void> {
  // Discover all current public-schema tables at runtime. This is more
  // robust than hardcoding the list — as new migrations land (US6 bets,
  // US2 payments, etc.) the new tables are picked up automatically with
  // no fixture maintenance.
  const result = await db.execute<{ tablename: string }>(
    sql.raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"),
  );
  const rows = (result as unknown as { rows: { tablename: string }[] }).rows ?? [];
  const tablenames = rows
    .map((r) => r.tablename)
    .filter((t) => !PRESERVE_TABLES.has(t));
  if (tablenames.length === 0) return;
  const list = tablenames.map((t) => `"${t}"`).join(', ');
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
 * Reset the test DB to a known seeded state. Call from `beforeEach`
 * (or `beforeAll` of a test file for shared seed). Returns the seed
 * row IDs so tests can reference them.
 */
export async function resetAndSeedTestDb(connectionString: string): Promise<TestDbSeed> {
  if (!connectionString) {
    throw new Error('resetAndSeedTestDb: DATABASE_URL is empty');
  }
  const db = makeDb(connectionString);
  await ensureMigrationsApplied(db);
  await truncateAll(db);
  return seedRows(db, process.env);
}

/** Read-only helper: confirm a row exists for a known member email. */
export async function findMemberByEmail(
  connectionString: string,
  email: string,
): Promise<{ id: string; clubId: string } | null> {
  const db = makeDb(connectionString);
  const row = await db.query.members.findFirst({ where: eq(members.email, email) });
  return row ? { id: row.id, clubId: row.clubId } : null;
}
