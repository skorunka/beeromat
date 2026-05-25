import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'playwright/.cache/**',
    'test-results/**',
    'next-env.d.ts',
    'drizzle/**',
  ]),
  {
    // Test files are not React. The react-hooks plugin false-positives
    // on Playwright's `use()` fixture callback (mistaking it for the
    // React `use` hook) and on Vitest helpers — disable those rules
    // for test code only.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]);

export default eslintConfig;
