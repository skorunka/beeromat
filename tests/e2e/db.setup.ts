import { test as setup } from '@playwright/test';

import { readEnvTest, applySeedEnv } from './env-test';
import { applyMigrations, assertLoopback } from './fixtures/test-db';

// Spec 015 — DB migration as a Playwright project (replaces the
// legacy `globalSetup` config option). Runs BEFORE the webserver
// URL probe via project dependencies in playwright.config.ts —
// fixes the "relation X does not exist" race documented in
// Microsoft Playwright issue #19571.
//
// Schema-only: DROP SCHEMA public CASCADE + migrate fresh. No
// domain seeding (that's auth.setup.ts's job). Uses the DIRECT
// Postgres connection (bypasses the Neon proxy) for speed —
// migrating ~70 statements through the proxy takes ~35s; direct
// is sub-second.

setup('schema: drop + migrate test DB', async () => {
  const env = readEnvTest();
  applySeedEnv(env);

  const directUrl = env.TEST_DATABASE_DIRECT_URL;
  if (!directUrl) {
    throw new Error(
      '[db.setup] TEST_DATABASE_DIRECT_URL missing from .env.test — ' +
        'cannot prepare the test schema.',
    );
  }
  assertLoopback(directUrl);

  const t0 = Date.now();
  await applyMigrations(directUrl);
  console.log(`[db.setup] schema dropped + remigrated in ${Date.now() - t0}ms`);
});
