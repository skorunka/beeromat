import { Pool } from 'pg';

// Tiny DB helper for the onboarding happy-path E2E (spec 016).
// Scoped intentionally — does NOT recreate the spec-015 fixture
// machinery. If a second E2E spec lands, refactor then.

// Actual schema as of 2026-05-26 (see `\dt` against beeromat_test).
// TRUNCATE … CASCADE handles FK ordering for us, so order in this
// list is purely cosmetic.
const ALL_DOMAIN_TABLES = [
  // Better Auth (singular table names — reserved word `user` needs
  // quoting in SQL; handled by the helper that builds the statement).
  'session',
  'account',
  'verification',
  'device_sessions',
  // Domain — events / voids first, parents last (cosmetic).
  'payment_state_transitions',
  'payments',
  'consumption_voids',
  'consumptions',
  'bet_transfer_voids',
  'bet_transfers',
  'match_bet_transfers',
  'match_agreement_sides',
  'match_agreements',
  'matches',
  'stock_changes',
  'drink_sessions',
  'beer_types',
  'invitations',
  'members',
  'club_banking_profiles',
  'clubs',
  'user',
] as const;

export function assertLoopback(url: string): void {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(
      `Refusing to operate against non-loopback DB URL: ${url.replace(/:[^:@]+@/, ':***@')}`,
    );
  }
}

export async function withTestDb<T>(
  directUrl: string,
  fn: (pool: Pool) => Promise<T>,
): Promise<T> {
  assertLoopback(directUrl);
  const pool = new Pool({ connectionString: directUrl });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export async function truncateAll(directUrl: string): Promise<void> {
  await withTestDb(directUrl, async (pool) => {
    // Single TRUNCATE … RESTART IDENTITY CASCADE keeps the schema +
    // sequences but wipes every row. Tables that don't exist (e.g.
    // a Better Auth table renamed upstream) make the whole statement
    // fail — adjust the list above if Better Auth changes its schema.
    const quoted = ALL_DOMAIN_TABLES.map((t) => `"${t}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  });
}

export async function countRows(directUrl: string, table: string): Promise<number> {
  return withTestDb(directUrl, async (pool) => {
    const r = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
    return r.rows[0]?.n ?? 0;
  });
}

export async function getOneRow<T = Record<string, unknown>>(
  directUrl: string,
  sql: string,
): Promise<T | null> {
  return withTestDb(directUrl, async (pool) => {
    const r = await pool.query(sql);
    return (r.rows[0] as T | undefined) ?? null;
  });
}
