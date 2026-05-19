import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest config — unit + integration tests.
// Async Server Components are NOT covered here (Vitest limitation,
// per research.md §5); those run in Playwright instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/{unit,integration}/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules', '.next'],
    pool: 'forks',
    poolOptions: {
      forks: {
        // PGlite uses native bindings; keep each test file in its own
        // fork to avoid module-cache contamination across DBs.
        singleFork: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
