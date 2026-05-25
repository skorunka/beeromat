import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { defineConfig } from 'drizzle-kit';

// Load .env.local once so db:migrate / db:push / db:studio find the
// DATABASE_URL without each script having to re-state --env-file. Node
// 20.6+ ships loadEnvFile natively; no extra dep.
const envLocal = resolve(process.cwd(), '.env.local');
if (existsSync(envLocal)) {
  loadEnvFile(envLocal);
}

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    // DATABASE_URL is required for db:push, db:migrate, db:studio.
    // db:generate works offline (only reads schema files), so an empty
    // string is acceptable during local schema iteration.
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
