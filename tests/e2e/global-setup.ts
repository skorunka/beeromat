import { applyMigrations } from './fixtures/test-db';
import { applySeedEnv, readEnvTest } from './env-test';

// Playwright globalSetup — runs once before the entire E2E run.
//
// Crash-safe schema preparation: DROP SCHEMA public CASCADE +
// re-migrate. This recovers cleanly from any prior run that failed
// mid-migration (no poisoned-DB cascade). Runs via a DIRECT Postgres
// connection (fast — the Neon HTTP proxy's per-query latency would
// make a ~70-statement migration take ~35s).
export default async function globalSetup(): Promise<void> {
  const env = readEnvTest();
  applySeedEnv(env);

  const directUrl = env.TEST_DATABASE_DIRECT_URL;
  if (!directUrl) {
    throw new Error(
      '[globalSetup] TEST_DATABASE_DIRECT_URL missing from .env.test — ' +
        'cannot prepare the test schema.',
    );
  }

  const t0 = Date.now();
  await applyMigrations(directUrl);
  console.log(`[globalSetup] test schema dropped + remigrated in ${Date.now() - t0}ms`);
}
