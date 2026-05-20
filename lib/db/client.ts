import 'server-only';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import { env } from '@/lib/env';
import * as schema from '@/lib/db/schema';

// Neon serverless driver — WebSocket pool variant
// (drizzle-orm/neon-serverless). This is the driver that supports
// interactive transactions (`db.transaction(async (tx) => …)`), which
// the consumption / payment / bet actions rely on. The HTTP-only
// variant (drizzle-orm/neon-http) cannot do interactive transactions
// and was the wrong initial choice — corrected here.
//
// `poolQueryViaFetch` keeps single (non-transactional) queries on the
// fast HTTP path; transactions transparently use the WebSocket.
//
// Node 22+ has a global WebSocket, but the Neon driver wants an
// explicit constructor — `ws` is the documented, reliable choice.
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

// Local-proxy mode. When NEON_LOCAL_PROXY_HOST is set (dev + test via
// docker-compose's local-neon-http-proxy), point the driver's HTTP
// and WebSocket endpoints at the local proxy. Production leaves it
// unset → the driver talks to Neon Cloud directly. This is generic
// configuration (any deployment routing through a private Neon mirror
// would use it) — not a test-only branch (constitution v1.3.0).
if (env.NEON_LOCAL_PROXY_HOST) {
  const host = env.NEON_LOCAL_PROXY_HOST;
  neonConfig.fetchEndpoint = `http://${host}/sql`;
  neonConfig.wsProxy = () => `${host}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineConnect = false;
}

// Lazy-initialized Drizzle client — the Pool is created on first
// access, not at module-import time, so `next build` can collect
// route metadata without a live database.

type Database = NeonDatabase<typeof schema>;

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  _db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return _db;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type { Database };
