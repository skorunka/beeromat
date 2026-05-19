import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import { env } from '@/lib/env';
import * as schema from '@/lib/db/schema';

// Lazy-initialized Drizzle client. The Neon HTTP driver and the Drizzle
// instance are created on first access, NOT at module-import time. This
// matters for `next build`, which collects page/route metadata by
// importing every route module — eager initialization would force the
// build environment to have a real DATABASE_URL even when no query is
// actually executed during build.
//
// At request time the proxy passes every property access through to the
// fully initialized Drizzle instance, so callers see no difference.

type Database = NeonHttpDatabase<typeof schema>;

let _sql: NeonQueryFunction<false, false> | null = null;
let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  _sql = neon(env.DATABASE_URL);
  _db = drizzle({ client: _sql, schema, casing: 'snake_case' });
  return _db;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type { Database };
