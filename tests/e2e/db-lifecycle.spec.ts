import { expect, test } from '@playwright/test';

import { findMemberByEmail, resetAndSeedTestDb } from './fixtures/test-db';
import { applySeedEnv, readEnvTest } from './env-test';

// Verify chain link 2: the test-DB lifecycle.
//
// Schema is prepared once by globalSetup (DROP SCHEMA + migrate). These
// tests exercise the per-test path: truncate + reseed, and confirm the
// seeded state is correct + idempotent across calls.

const envTest = readEnvTest();
applySeedEnv(envTest);
const DIRECT_URL = envTest.TEST_DATABASE_DIRECT_URL ?? '';
const SEED_EMAIL = envTest.SEED_ADMIN_EMAIL ?? 'admin@example.test';

test.describe('@chain-link-2 test database lifecycle', () => {
  test('reset + seed produces the expected admin member', async () => {
    const seed = await resetAndSeedTestDb(DIRECT_URL);
    expect(seed.admin.email).toBe(SEED_EMAIL);

    const found = await findMemberByEmail(DIRECT_URL, SEED_EMAIL);
    expect(found).not.toBeNull();
    expect(found!.clubId).toBe(seed.club.id);
  });

  test('reset is idempotent across calls (no row accumulation)', async () => {
    await resetAndSeedTestDb(DIRECT_URL);
    const seed2 = await resetAndSeedTestDb(DIRECT_URL);
    const found = await findMemberByEmail(DIRECT_URL, SEED_EMAIL);
    expect(found).not.toBeNull();
    expect(found!.clubId).toBe(seed2.club.id);
  });
});
