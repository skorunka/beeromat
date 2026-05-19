import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';

import * as schema from '@/lib/db/schema';

export type TestDb = PgliteDatabase<typeof schema>;

/**
 * Spin up an in-process Postgres for one test file. Each call returns
 * a fresh DB with all current Drizzle migrations applied.
 *
 * Usage:
 *   const { db } = await makeTestDb();
 *   // optionally: vi.mock('@/lib/db/client', () => ({ db }))
 */
export async function makeTestDb(): Promise<{ db: TestDb; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });

  // Apply migrations in lexical order. drizzle-kit names them
  // NNNN_*.sql so simple sort gives the correct sequence.
  const migrationsDir = path.join(process.cwd(), 'drizzle');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    // PGlite's exec runs the file as one statement batch; drizzle-kit
    // separates statements with --> statement-breakpoint comments.
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }

  return { db, client };
}
