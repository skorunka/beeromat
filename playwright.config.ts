import { defineConfig, devices } from '@playwright/test';

import { readEnvTest } from './tests/e2e/env-test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// E2E configuration.
//   db.setup      — DROP SCHEMA + migrate the test DB once (spec 015
//                   project, replaces the legacy globalSetup option)
//   auth.setup    — signs the shared admin in, saves storageState (014)
//   chromium      — true-E2E specs (tests/e2e/*.spec.ts)
//   chromium-mock — API-mocked E2E specs (tests/e2e-mock/*.spec.ts)
//   globalTeardown— wipe the test DB clean after the run
//   webServer     — production build of the app on an isolated port,
//                   pointed at the test DB via the Neon proxy
export default defineConfig({
  testDir: './tests/e2e',
  // Per-test budget. Generous because every "Given a signed-in member"
  // spec drives the real magic-link sign-in flow in its setup, and
  // signInAndUnlock retries that flow up to 3× to absorb transient
  // dead-pooled-connection failures against the local Neon proxy.
  timeout: 90_000,
  // Spec 015 — globalSetup REMOVED. The DB migration runs as a proper
  // Playwright project (`db.setup`) instead, so the webServer URL
  // probe can no longer race ahead of it (see Microsoft Playwright
  // issue #19571).
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
    // Spec 015 — DB migration project. Runs BEFORE the webserver URL
    // probe (via project dependencies below), eliminating the
    // "relation X does not exist" race that surfaced from the old
    // globalSetup ordering. Schema-only; auth.setup handles the
    // shared admin.
    {
      name: 'db.setup',
      testMatch: /db\.setup\.ts$/,
    },
    // Spec 014 — auth setup project. Signs the shared admin in once
    // and saves the authenticated browser context to
    // playwright/.auth/admin.json. Depends on db.setup so the schema
    // is there when the sign-in tries to write the device-session row.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      dependencies: ['db.setup'],
    },
    // True-E2E project (spec 014 storageState pattern). Slimmed to
    // ~10-12 critical user-journey specs once spec-015 migrations
    // complete.
    {
      name: 'chromium',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        // Pre-authenticated context for the suite. Auth-flow specs
        // that explicitly drive sign-in opt out via:
        //   test.use({ storageState: { cookies: [], origins: [] } })
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['db.setup', 'setup'],
    },
    // Spec 015 — API-mocked E2E project. Same webserver, same
    // storageState, but specs intercept Server Action endpoints via
    // page.route() so no DB writes happen. Lives in its own directory.
    {
      name: 'chromium-mock',
      testDir: './tests/e2e-mock',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['db.setup', 'setup'],
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${BASE_URL}/cs/sign-in`,
    // Generous: a cold Turbopack production build on a loaded dev
    // machine (Docker + a running dev server competing for CPU) can
    // take several minutes before `next start` is reachable.
    timeout: 420_000,
    // Reuse a server already listening on the port when running locally.
    // Playwright's own webServer management — building, spawning, and
    // killing the `pnpm build && pnpm start` child-process tree — is
    // unreliable on Windows: it has orphaned `next start` processes and
    // aborted mid-build (exit 127). A `next start` started by hand is
    // stable, so locally we start one manually (with this same
    // `.env.test`) and let Playwright reuse it. CI always boots fresh.
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    // Single source of truth for .env.test parsing (shared with the
    // fixtures via tests/e2e/env-test.ts).
    env: readEnvTest(),
  },
});
