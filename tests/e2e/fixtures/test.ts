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
  seedInvitation,
  seedMember,
  seedPayment,
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
  invitation: (a: Parameters<typeof seedInvitation>[1]) => ReturnType<typeof seedInvitation>;
  beerType: (a: Parameters<typeof seedBeerType>[1]) => ReturnType<typeof seedBeerType>;
  drinkSession: (a: Parameters<typeof seedDrinkSession>[1]) => ReturnType<typeof seedDrinkSession>;
  consumption: (a: Parameters<typeof seedConsumption>[1]) => ReturnType<typeof seedConsumption>;
  payment: (a: Parameters<typeof seedPayment>[1]) => ReturnType<typeof seedPayment>;
}

export const test = base.extend<{ seed: SeedContext }>({
  // The app is bilingual (next-intl, default locale `cs`). The E2E
  // suite pins itself to English by auto-prefixing every same-origin
  // navigation with `/en` — so specs keep using bare paths (`/log`)
  // and their English text assertions stay valid. `/api/*` routes and
  // already-localed paths are left untouched.
  page: async ({ page }, use) => {
    const realGoto = page.goto.bind(page);
    page.goto = ((url: string, options?: Parameters<typeof realGoto>[1]) => {
      const localed =
        url.startsWith('/') &&
        !url.startsWith('/en') &&
        !url.startsWith('/cs') &&
        !url.startsWith('/api')
          ? `/en${url}`
          : url;
      return realGoto(localed, options);
    }) as typeof page.goto;
    await use(page);
  },
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
        invitation: (a) => seedInvitation(db, a),
        beerType: (a) => seedBeerType(db, a),
        drinkSession: (a) => seedDrinkSession(db, a),
        consumption: (a) => seedConsumption(db, a),
        payment: (a) => seedPayment(db, a),
      });
    } finally {
      await pool.end();
    }
  },
});

export { expect } from '@playwright/test';
