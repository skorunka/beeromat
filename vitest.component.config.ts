import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component-layer Vitest config (jsdom). React Testing Library
// renders components in isolation with mocked data; no webserver,
// no DB. Use this layer for presentational behaviour, locale
// rendering, empty/loading states, a11y, and form interactions.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/component/_setup.ts'],
    globals: true,
    include: ['tests/component/**/*.spec.tsx'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
    },
  },
});
