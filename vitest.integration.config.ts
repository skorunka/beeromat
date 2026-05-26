import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Integration-layer Vitest config — Node env + PGlite. Tests that
// exercise Drizzle transactions, SQL queries, or stateful DB
// rules. Pure-function unit tests live in tests/unit/ instead
// (vitest.unit.config.ts).
//
// hookTimeout is bumped to 30s for the first-beforeEach-per-fork
// WASM warmup: PGlite ships ~16 MB of WASM + data files
// (pglite.wasm, pglite.data, initdb.wasm) which cold-load + compile
// in 10–15s on Windows when the OS file cache is cold (right after
// pnpm install, or first run after reboot). Subsequent calls in the
// same fork are sub-second.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/integration/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    pool: 'forks',
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
