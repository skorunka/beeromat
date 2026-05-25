import path from 'node:path';
import { defineConfig, devices } from '@playwright/experimental-ct-react';

// Spec 015 — Playwright Component Testing config (visual subset of
// the component layer). For tests that assert computed CSS:
// colour, contrast, font family, touch-target size — i.e., the
// things jsdom can't tell you. File pattern: `*.ct.spec.tsx`.
//
// Plain RTL component tests (no real CSS needed) live in the same
// `tests/component/` directory under `*.spec.tsx` and run via
// `pnpm test:component` (vitest.component.config.ts).
export default defineConfig({
  testDir: './tests/component',
  testMatch: /.*\.ct\.spec\.tsx$/,
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    // Real Tailwind CSS via the project's globals.css.
    ctViteConfig: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
    },
  },
});
