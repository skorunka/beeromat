import { defineConfig } from 'drizzle-kit';

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
