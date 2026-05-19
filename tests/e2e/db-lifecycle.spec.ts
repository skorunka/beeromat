import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findMemberByEmail, resetAndSeedTestDb } from './fixtures/test-db';

// Verify chain link 2: the test-DB lifecycle.
//
// What this proves:
//   1. The .env.test DATABASE_URL points at a reachable test project
//   2. ensureMigrationsApplied runs without throwing
//   3. truncateAll runs without throwing
//   4. seed inserts the expected club + admin member
//   5. A second call to resetAndSeedTestDb produces the same shape
//      (idempotent across test invocations)

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
const TEST_DB_URL = envTest.DATABASE_URL;
const SEED_EMAIL = envTest.SEED_ADMIN_EMAIL ?? 'admin@example.test';

test.describe('@chain-link-2 test database lifecycle', () => {
  test.skip(
    !TEST_DB_URL || /localhost\.test/.test(TEST_DB_URL),
    'DATABASE_URL in .env.test still points at the placeholder; provision a dedicated Neon test project first.',
  );

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
