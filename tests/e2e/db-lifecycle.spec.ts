import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { findMemberByEmail, resetAndSeedTestDb } from './fixtures/test-db';

// Verify chain link 2: the test-DB lifecycle.
//
// What this proves:
//   1. .env.test points at a reachable local Neon proxy + Postgres
//   2. Drizzle's migrate() runs without throwing
//   3. TRUNCATE all domain + Better Auth tables runs without throwing
//   4. seedRows inserts the expected club + admin member
//   5. A second call produces the same shape (idempotent re-seeding)

function readEnvTest(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../../.env.test');
  const text = readFileSync(envPath, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

const envTest = readEnvTest();
const TEST_DB_URL = envTest.DATABASE_URL ?? '';
const SEED_EMAIL = envTest.SEED_ADMIN_EMAIL ?? 'admin@example.test';

// Propagate the fetchEndpoint to the fixture's process so its internal
// Drizzle/Neon client routes through the local proxy.
if (envTest.NEON_FETCH_ENDPOINT) {
  process.env.NEON_FETCH_ENDPOINT = envTest.NEON_FETCH_ENDPOINT;
}
for (const seedKey of ['SEED_CLUB_NAME', 'SEED_CLUB_CURRENCY', 'SEED_CLUB_LOCALE', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_NAME']) {
  const v = envTest[seedKey];
  if (v) process.env[seedKey] = v;
}

test.describe('@chain-link-2 test database lifecycle', () => {
  test('reset + seed produces the expected admin member', async () => {
    const seed = await resetAndSeedTestDb(TEST_DB_URL);
    expect(seed.admin.email).toBe(SEED_EMAIL);

    const found = await findMemberByEmail(TEST_DB_URL, SEED_EMAIL);
    expect(found).not.toBeNull();
    expect(found!.clubId).toBe(seed.club.id);
  });

  test('reset is idempotent across calls (no row accumulation)', async () => {
    await resetAndSeedTestDb(TEST_DB_URL);
    const seed2 = await resetAndSeedTestDb(TEST_DB_URL);
    const found = await findMemberByEmail(TEST_DB_URL, SEED_EMAIL);
    expect(found).not.toBeNull();
    expect(found!.clubId).toBe(seed2.club.id);
  });
});
