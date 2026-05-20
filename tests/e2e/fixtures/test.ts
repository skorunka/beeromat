import { test as base } from '@playwright/test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@/lib/db/schema';

import { readEnvTest } from '../env-test';
import { assertLoopback, truncateAll, type Db } from './test-db';
import {
  seedBankingProfile,
  seedBeerType,
  seedClub,
  seedConsumption,
  seedDrinkSession,
  seedMember,
} from './seed';

// Shared Playwright base fixture for all beeromat E2E specs.
//
// Import { test, expect } from this file instead of '@playwright/test'.
// Every test that uses the `seed` fixture starts from an EMPTY test
// database — truncated in the fixture's setup phase — and then composes
// exactly the rows its scenario needs via the bound builders. This
// satisfies requirement #5: each test seeds its own specific state.
//
// The schema itself is prepared once by globalSetup (DROP SCHEMA +
// migrate); this fixture only truncates rows, never touches schema.

const DIRECT_URL = readEnvTest().TEST_DATABASE_DIRECT_URL ?? '';

/** Bound seed builders + the raw Db handle, scoped to one test. */
export interface SeedContext {
  db: Db;
  club: (o?: Parameters<typeof seedClub>[1]) => ReturnType<typeof seedClub>;
  bankingProfile: (a: Parameters<typeof seedBankingProfile>[1]) => ReturnType<typeof seedBankingProfile>;
  member: (a: Parameters<typeof seedMember>[1]) => ReturnType<typeof seedMember>;
  beerType: (a: Parameters<typeof seedBeerType>[1]) => ReturnType<typeof seedBeerType>;
  drinkSession: (a: Parameters<typeof seedDrinkSession>[1]) => ReturnType<typeof seedDrinkSession>;
  consumption: (a: Parameters<typeof seedConsumption>[1]) => ReturnType<typeof seedConsumption>;
}

export const test = base.extend<{ seed: SeedContext }>({
  seed: async ({}, use) => {
    assertLoopback(DIRECT_URL);
    const pool = new Pool({ connectionString: DIRECT_URL });
    try {
      const db = drizzle(pool, { schema, casing: 'snake_case' });
      // Empty slate before the test composes its scenario.
      await truncateAll(db);
      await use({
        db,
        club: (o) => seedClub(db, o),
        bankingProfile: (a) => seedBankingProfile(db, a),
        member: (a) => seedMember(db, a),
        beerType: (a) => seedBeerType(db, a),
        drinkSession: (a) => seedDrinkSession(db, a),
        consumption: (a) => seedConsumption(db, a),
      });
    } finally {
      await pool.end();
    }
  },
});

export { expect } from '@playwright/test';
