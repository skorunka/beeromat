import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Spec 016 — minimal Playwright config for the single onboarding
// happy-path E2E. Intentionally NOT the spec-015 5-project chain:
// one project, one worker, no globalSetup, no db.setup project.
// If a second E2E spec lands, that spec gets to decide whether
// extending this config (a second test in the same file) or
// adding a second project is the right move.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// Parse .env.test once and hand it to Playwright's webServer.
// Vercel injects production env separately; .env.test never reaches
// a real deployment (see .env.test header for the safety story).
function readEnvTest(): Record<string, string> {
  const raw = readFileSync('.env.test', 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `${BASE_URL}/cs/setup`,
    timeout: 420_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: readEnvTest(),
  },
});
