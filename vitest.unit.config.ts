import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit-layer Vitest config — pure functions only (Zod schemas,
// authz predicates, IBAN/SPAYD/format helpers, lint scripts).
// Tests that touch a real DB live in tests/integration/ instead
// (vitest.integration.config.ts) so the WASM warmup cost is
// scoped to that one suite.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/unit/**/*.{spec,test}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
