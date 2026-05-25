import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// Drizzle-kit runs outside the Next.js runtime, so it doesn't pick up
// .env.local / .env.development on its own. @next/env applies the same
// precedence Next uses (recommended by drizzle-team/drizzle-orm#2781).
loadEnvConfig(process.cwd());

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
