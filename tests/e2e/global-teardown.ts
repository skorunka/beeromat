import { wipeTestDb } from './fixtures/test-db';
import { readEnvTest } from './env-test';

// Playwright globalTeardown — runs once after the entire E2E run.
// Satisfies "destroy DB after test end": every row in beeromat_test is
// truncated, leaving the test database clean. Schema is preserved.
export default async function globalTeardown(): Promise<void> {
  const env = readEnvTest();
  const directUrl = env.TEST_DATABASE_DIRECT_URL;
  if (!directUrl) {
    console.warn('[globalTeardown] no TEST_DATABASE_DIRECT_URL; skipping wipe');
    return;
  }
  await wipeTestDb(directUrl);
  console.log('[globalTeardown] test database wiped clean');
}
