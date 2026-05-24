import 'server-only';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

// Spec 009 — cheap "is this a fresh-install deployment?" signal for
// the proxy.
//
// The proxy calls isFreshDeployment() on every request; redirecting
// the very first visitor to /setup. Two COUNT queries on tables with
// 0 rows are microseconds against the local proxy and single-digit
// ms against Neon — but running them on every request after
// bootstrap is wasted work.
//
// The state transition is strictly one-way (research.md §2): once a
// clubs row OR a users row exists, the deployment is no longer fresh
// and will never be fresh again in normal operation (manual psql
// deletion is an out-of-scope foot-gun). So we cache `false`
// indefinitely once observed; while the cache is null or true we
// re-query (the fresh-state window is brief by design).
//
// bootstrapClubAction calls invalidateFreshDeploymentCache() AFTER
// its commit so the same process that just bootstrapped sees the
// false state on its very next proxy hit without a re-query.

let isFreshCached: boolean | null = null;

type CountRow = {
  clubs: string;
  users: string;
} & Record<string, unknown>;

export async function isFreshDeployment(): Promise<boolean> {
  if (isFreshCached === false) return false;
  const result = await db.execute<CountRow>(sql`
    SELECT
      (SELECT count(*)::text FROM clubs) AS clubs,
      (SELECT count(*)::text FROM "user") AS users
  `);
  const row = result.rows[0];
  const fresh = Number(row?.clubs ?? 0) === 0 && Number(row?.users ?? 0) === 0;
  if (!fresh) isFreshCached = false;
  return fresh;
}

export function invalidateFreshDeploymentCache(): void {
  isFreshCached = null;
}
