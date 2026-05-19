import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';

import * as schema from '@/lib/db/schema';
import { clubs, clubBankingProfiles } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';

// E2E test-DB lifecycle. Per the verify-each-link rule and the
// constitutional "no mixing real with test data" requirement, this
// connects to a DEDICATED Neon project (a separate project from any
// dev/prod project — its connection string lives in .env.test).
//
// On first call within a test run: applies every drizzle/ migration
// (idempotent — CREATE TABLE IF NOT EXISTS via drizzle's normal SQL is
// safe to re-run; for clean migrations we rely on each test file's
// truncate step rather than DROP+CREATE).
//
// Before each test scenario: truncates every domain table in
// dependency-safe order using CASCADE, then re-seeds the single v1
// club + admin from the SEED_* env vars in .env.test.
//
// The test project itself persists between runs; data is always wiped
// before each test, so no real-data mixing is possible and no
// cross-test contamination can occur.

const DOMAIN_TABLES_IN_TRUNCATE_ORDER = [
  // Children first, then parents — CASCADE handles dependents but
  // explicit ordering makes the intent visible.
  'consumption_voids',
  'consumptions',
  'bet_transfer_voids',
  'bet_transfers',
  'payment_state_transitions',
  'payments',
  'stock_changes',
  'drink_sessions',
  'beer_types',
  'invitations',
  'device_sessions',
  'members',
  'club_banking_profiles',
  'clubs',
  // Better Auth tables.
  'session',
  'account',
  'verification',
  'user',
];

export interface TestDbSeed {
  club: { id: string; name: string };
  admin: { id: string; userId: string; email: string };
}

let migrationsApplied = false;

function makeClient(connectionString: string) {
  const sqlClient = neon(connectionString);
  const db = drizzle({ client: sqlClient, schema, casing: 'snake_case' });
  return { sqlClient, db };
}

/** Apply every drizzle/ migration once per process. Idempotent — uses
 *  `IF NOT EXISTS` semantics where Drizzle emits them. Re-applying on
 *  a non-empty schema is a no-op. */
async function ensureMigrationsApplied(sqlClient: ReturnType<typeof neon>) {
  if (migrationsApplied) return;
  const migrationsDir = path.join(process.cwd(), 'drizzle');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(path.join(migrationsDir, file), 'utf-8');
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      try {
        await sqlClient(stmt);
      } catch (err: unknown) {
        // Ignore "already exists" type errors so re-applying on an
        // existing schema is safe. Surface anything else.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists|duplicate object/i.test(msg)) {
          throw new Error(`Migration ${file} failed: ${msg}\n--\n${stmt.slice(0, 200)}`);
        }
      }
    }
  }
  migrationsApplied = true;
}

/** TRUNCATE every domain + Better Auth table. CASCADE handles FK
 *  dependents; RESTART IDENTITY resets sequence-backed columns. */
async function truncateAll(sqlClient: ReturnType<typeof neon>) {
  const list = DOMAIN_TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(', ');
  await sqlClient(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Insert the canonical v1 seed (one club + one admin user + member). */
async function seed(
  db: ReturnType<typeof makeClient>['db'],
  env: NodeJS.ProcessEnv,
): Promise<TestDbSeed> {
  const [club] = await db
    .insert(clubs)
    .values({
      name: env.SEED_CLUB_NAME ?? 'Test Club',
      currencyCode: env.SEED_CLUB_CURRENCY ?? 'CZK',
      defaultLocale: env.SEED_CLUB_LOCALE ?? 'cs-CZ',
    })
    .returning();
  if (!club) throw new Error('seed: club insert returned no row');

  await db.insert(clubBankingProfiles).values({ clubId: club.id });

  const [user] = await db
    .insert(users)
    .values({
      email: env.SEED_ADMIN_EMAIL ?? 'admin@example.test',
      name: env.SEED_ADMIN_NAME ?? 'Test Admin',
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
  if (!connectionString || /localhost\.test/.test(connectionString)) {
    throw new Error(
      'resetAndSeedTestDb: DATABASE_URL in .env.test is the placeholder. ' +
        'Replace it with the connection string of a DEDICATED Neon test project ' +
        'before running DB-dependent E2E specs.',
    );
  }
  const { sqlClient, db } = makeClient(connectionString);
  await ensureMigrationsApplied(sqlClient);
  await truncateAll(sqlClient);
  return seed(db, process.env);
}

/**
 * Read-only helper: confirm a row exists for a known member email.
 * Used by chain-link-2's verification spec to prove the fixture ran.
 */
export async function findMemberByEmail(
  connectionString: string,
  email: string,
): Promise<{ id: string; clubId: string } | null> {
  const { db } = makeClient(connectionString);
  const row = await db.query.members.findFirst({
    where: eq(members.email, email),
  });
  return row ? { id: row.id, clubId: row.clubId } : null;
}

// satisfy unused-vars if needed
void sql;
