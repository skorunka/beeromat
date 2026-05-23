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
    // PGlite uses native bindings; keep each test file in its own fork
    // to avoid module-cache contamination across DBs. vitest 4 defaults
    // pool: 'forks' to singleFork: false, so the explicit block we used
    // to need under vitest 3 (and which moved out of the public
    // InlineConfig type in vitest 4) is no longer required.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
