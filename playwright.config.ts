import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// Load .env.test for the webServer. We deliberately avoid `dotenv`
// because it's not yet a project dependency; parsing KEY=VALUE lines
// is trivial and keeps the e2e setup self-contained.
function loadEnvTest(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env.test');
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

// E2E configuration.
//   globalSetup    — DROP SCHEMA + migrate the test DB once (crash-safe)
//   globalTeardown — wipe the test DB clean after the run
//   webServer      — production build of the app on an isolated port,
//                    pointed at the test DB via the Neon proxy
export default defineConfig({
  testDir: './tests/e2e',
  // Prepare the test schema once, before any test or the webServer.
  globalSetup: './tests/e2e/global-setup.ts',
  // Wipe the test DB clean once the whole run ends ("destroy DB after
  // test end"). Per-test reset happens in each spec's beforeEach via
  // resetAndSeedTestDb.
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
    env: loadEnvTest(),
  },
});
