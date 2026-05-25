import { test as base } from '@playwright/test';
import { eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@/lib/db/schema';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';

import { readEnvTest } from '../env-test';
import { assertLoopback, truncateAll, truncateDomainOnly, type Db } from './test-db';
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

// ─── Authenticated fixture (spec 014 E2E perf) ─────────────────────
//
// Use this `test` export instead of the legacy `test` above when your
// spec just needs "a signed-in club_admin". The setup project
// (tests/e2e/auth.setup.ts) signs the SHARED admin in once at the
// start of the run and saves the cookies + PIN state to
// playwright/.auth/admin.json. Specs using `authedTest` automatically
// load that state — no per-test sign-in cost.
//
// Per-test reset uses `truncateDomainOnly` so the admin's
// session/user/member/club rows persist across the run; only domain
// tables (beers, consumptions, payments, matches, etc.) get wiped.
//
// Auth-flow specs (sign-in, invitation, forgot-PIN, onboarding,
// email-i18n) CANNOT use this — they need to start unauthenticated
// AND need full DB control. Keep using the legacy `test`/`seed`
// fixtures above for those.

export interface AuthedContext {
  /** The persistent admin user row (preserved by truncateDomainOnly). */
  admin: { userId: string; memberId: string; clubId: string; email: string; displayName: string };
  /** Raw DB handle for ad-hoc seeding. */
  db: Db;
  /** Seed an extra member in the admin's club (returns the inserted member id). */
  seedExtraMember: (args: {
    role?: schema.Member['role'];
    email?: string;
    displayName: string;
  }) => Promise<{ userId: string; memberId: string }>;
  /**
   * Domain-table seed builders bound to the shared admin's club.
   * Mirror the legacy `seed.*` builders but auto-fill `clubId` (and,
   * where applicable, `createdByUserId`) from the admin context.
   * Domain rows are wiped between tests by `truncateDomainOnly`, so no
   * per-test cleanup is needed.
   */
  seed: {
    beerType: (
      args?: Omit<Parameters<typeof seedBeerType>[1], 'clubId' | 'createdByUserId'> & {
        createdByUserId?: string;
      },
    ) => ReturnType<typeof seedBeerType>;
    drinkSession: (
      args?: Omit<Parameters<typeof seedDrinkSession>[1], 'clubId' | 'openedByUserId'> & {
        openedByUserId?: string;
      },
    ) => ReturnType<typeof seedDrinkSession>;
    consumption: (
      args: Omit<Parameters<typeof seedConsumption>[1], 'clubId' | 'createdByUserId'> & {
        createdByUserId?: string;
      },
    ) => ReturnType<typeof seedConsumption>;
    payment: (
      args: Omit<Parameters<typeof seedPayment>[1], 'clubId' | 'createdByUserId'> & {
        createdByUserId?: string;
      },
    ) => ReturnType<typeof seedPayment>;
    bankingProfile: (
      args?: Omit<Parameters<typeof seedBankingProfile>[1], 'clubId'>,
    ) => ReturnType<typeof seedBankingProfile>;
  };
}

let extraSeq = 0;

export const authedTest = base.extend<{ authed: AuthedContext }>({
  // Same locale auto-prefix as the legacy fixture above.
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
  authed: async ({}, use) => {
    assertLoopback(DIRECT_URL);
    const pool = new Pool({ connectionString: DIRECT_URL });
    try {
      const db = drizzle(pool, { schema, casing: 'snake_case' });

      // Locate the shared admin by SEED email (it MUST exist — the
      // setup project seeded it). Capture its ids BEFORE truncate so
      // we can preserve exactly its row across tests.
      const seedEmail = readEnvTest().SEED_ADMIN_EMAIL ?? 'admin@example.test';
      const adminUser = await db.query.users.findFirst({
        where: eq(users.email, seedEmail),
      });
      if (!adminUser) {
        throw new Error(
          'authed fixture: shared admin user missing — did auth.setup.ts run?',
        );
      }
      const adminMember = await db.query.members.findFirst({
        where: eq(members.userId, adminUser.id),
      });
      if (!adminMember) throw new Error('authed fixture: shared admin member missing');
      const adminClub = await db.query.clubs.findFirst({
        where: eq(clubs.id, adminMember.clubId),
      });
      if (!adminClub) throw new Error('authed fixture: shared admin club missing');

      // Reset domain tables (consumptions, payments, bets, matches, …)
      // AND prune any extra users/members/clubs leaked by a prior test.
      // CASCADE on the domain truncate already removed FK references to
      // those extras, so plain DELETEs here are safe.
      await truncateDomainOnly(db);
      await db.delete(members).where(ne(members.id, adminMember.id));
      await db.delete(users).where(ne(users.id, adminUser.id));
      await db.delete(clubs).where(ne(clubs.id, adminClub.id));

      const ctx: AuthedContext = {
        admin: {
          userId: adminUser.id,
          memberId: adminMember.id,
          clubId: adminClub.id,
          email: adminUser.email,
          displayName: adminUser.name,
        },
        db,
        seedExtraMember: async (args) => {
          extraSeq += 1;
          const email = args.email ?? `extra${extraSeq}-${Date.now()}@example.test`;
          const [u] = await db
            .insert(users)
            .values({ email, name: args.displayName, emailVerified: true })
            .returning();
          if (!u) throw new Error('seedExtraMember: user insert failed');
          const [m] = await db
            .insert(members)
            .values({
              clubId: adminClub.id,
              userId: u.id,
              email,
              displayName: args.displayName,
              role: args.role ?? 'member',
              acceptedInvitationAt: new Date(),
            })
            .returning();
          if (!m) throw new Error('seedExtraMember: member insert failed');
          return { userId: u.id, memberId: m.id };
        },
        seed: {
          beerType: (args = {}) =>
            seedBeerType(db, {
              ...args,
              clubId: adminClub.id,
              createdByUserId: args.createdByUserId ?? adminUser.id,
            }),
          drinkSession: (args = {}) =>
            seedDrinkSession(db, {
              ...args,
              clubId: adminClub.id,
              openedByUserId: args.openedByUserId ?? adminUser.id,
            }),
          consumption: (args) =>
            seedConsumption(db, {
              ...args,
              clubId: adminClub.id,
              createdByUserId: args.createdByUserId ?? adminUser.id,
            }),
          payment: (args) =>
            seedPayment(db, {
              ...args,
              clubId: adminClub.id,
              createdByUserId: args.createdByUserId ?? adminUser.id,
            }),
          bankingProfile: (args = {}) =>
            seedBankingProfile(db, { ...args, clubId: adminClub.id }),
        },
      };
      await use(ctx);
    } finally {
      await pool.end();
    }
  },
});
