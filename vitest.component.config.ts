import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Spec 015 — component-layer Vitest config (jsdom). React Testing
// Library renders components in isolation; no webserver, no DB.
// For tests that assert computed CSS (colour, contrast, font,
// touch-target size) use Playwright CT instead (file extension
// `.ct.spec.tsx`, picked up by `playwright-ct.config.ts`).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/component/_setup.ts'],
    globals: true,
    include: ['tests/component/**/*.spec.tsx'],
    // Exclude the Playwright CT branch (it has its own runner).
    exclude: ['tests/component/**/*.ct.spec.tsx', 'node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
