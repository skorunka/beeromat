import 'server-only';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import { env } from '@/lib/env';
import * as schema from '@/lib/db/schema';

// Optional fetchEndpoint override. Unset in production (driver hits
// Neon's public HTTP endpoint). Local dev + test set this to point
// at a local proxy (e.g. http://localhost:14444/sql, served by the
// ghcr.io/timowilhelm/local-neon-http-proxy container in
// docker-compose.yml). The driver, the SQL emitted by Drizzle, and
// every line of code below this point is identical in both worlds —
// only the URL differs. (Constitution v1.3.0 §Test/Prod Code
// Separation: configuration over branching.)
if (env.NEON_FETCH_ENDPOINT) {
  neonConfig.fetchEndpoint = env.NEON_FETCH_ENDPOINT;
}

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

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  const client = neon(env.DATABASE_URL);
  _db = drizzle({ client, schema, casing: 'snake_case' });
  return _db;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type { Database };
