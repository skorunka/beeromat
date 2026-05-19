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

// Each commit in the E2E setup chain extends this config. The smoke
// commit verifies just: Playwright can spawn the production-mode app
// on an isolated port with .env.test loaded, the home redirect works,
// and the sign-in page renders.
//
// Later commits will add:
//   - Neon-branch test DB lifecycle (per-run create + drop)
//   - Resend HTTP interception (magic-link capture)
//   - Per-test seed fixtures
//   - User-story specs
export default defineConfig({
  testDir: './tests/e2e',
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
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: loadEnvTest(),
  },
});
