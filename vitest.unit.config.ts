import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Spec 015 — unit-layer Vitest config (split out of the legacy
// vitest.config.ts so each test layer's startup overhead is
// isolated). Server actions, Zod schemas, business logic,
// transactions, queries — anything that doesn't need a DOM.
//
// Async Server Components are NOT covered here (Vitest limitation);
// those run in Playwright instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/{unit,integration}/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['tests/component/**', 'tests/e2e/**', 'tests/e2e-mock/**', 'node_modules', '.next'],
    // PGlite uses native bindings; keep each test file in its own fork
    // to avoid module-cache contamination across DBs.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
