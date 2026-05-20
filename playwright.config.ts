import { defineConfig, devices } from '@playwright/test';

import { readEnvTest } from './tests/e2e/env-test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// E2E configuration.
//   globalSetup    — DROP SCHEMA + migrate the test DB once (crash-safe)
//   globalTeardown — wipe the test DB clean after the run
//   webServer      — production build of the app on an isolated port,
//                    pointed at the test DB via the Neon proxy
export default defineConfig({
  testDir: './tests/e2e',
  // Per-test budget. Generous because every "Given a signed-in member"
  // spec drives the real magic-link sign-in flow in its setup, and
  // signInAndUnlock retries that flow up to 3× to absorb transient
  // dead-pooled-connection failures against the local Neon proxy.
  timeout: 90_000,
  // Prepare the test schema once, before any test or the webServer.
  globalSetup: './tests/e2e/global-setup.ts',
  // Wipe the test DB clean once the whole run ends ("destroy DB after
  // test end"). Per-test reset happens in each spec's beforeEach.
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // workers:1 is a HARD CONSTRAINT, not a default. The test-DB fixture
  // truncates the whole `beeromat_test` database between tests — two
  // parallel workers would clobber each other's data. Going parallel
  // would require a DB-per-worker scheme; do not raise this without it.
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${BASE_URL}/cs/sign-in`,
    timeout: 240_000,
    // Never reuse a stale server — a server left over from a different
    // run could be pointed at the wrong DB / env, and the `env` below
    // is ignored when an existing server is reused. Always boot fresh.
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    // Single source of truth for .env.test parsing (shared with the
    // fixtures via tests/e2e/env-test.ts).
    env: readEnvTest(),
  },
});
