import { test as setup, expect } from '@playwright/test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@/lib/db/schema';

import { readEnvTest } from './env-test';
import { assertLoopback, truncateAll } from './fixtures/test-db';
import { seedClub, seedBankingProfile, seedMember } from './fixtures/seed';
import { reachPinSetupGate } from './fixtures/auth';

// Spec 014 (E2E perf) — Playwright "setup project".
//
// Runs ONCE before the chromium project. Drops the test DB to an
// empty slate, seeds the SHARED admin (one club, one club_admin
// member), drives the magic-link sign-in flow once, then saves the
// resulting browser context (cookies + localStorage) to a state file.
//
// Every authenticated spec then loads that state instead of paying
// the 4-12s sign-in cost per test. See tests/e2e/fixtures/test.ts
// for the `authenticated` fixture wiring; see playwright.config.ts
// for the project dependency.
//
// Auth-flow specs (auth, forms-auth, ux-forgot-pin, onboarding,
// us5-invite-onboard, email-i18n) opt OUT by using the legacy
// full-truncate fixture and driving their own sign-in.

const SETUP_PIN = '0000';
const envTest = readEnvTest();
const DIRECT_URL = envTest.TEST_DATABASE_DIRECT_URL ?? '';

export const SHARED_ADMIN = {
  email: envTest.SEED_ADMIN_EMAIL ?? 'admin@example.test',
  displayName: envTest.SEED_ADMIN_NAME ?? 'Test Admin',
  pin: SETUP_PIN,
} as const;

export const AUTH_STATE_PATH = 'playwright/.auth/admin.json';

setup('seed shared admin + save authenticated storage state', async ({ page }) => {
  assertLoopback(DIRECT_URL);
  const pool = new Pool({ connectionString: DIRECT_URL });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });

    // Empty slate, then seed exactly one club + one admin member.
    await truncateAll(db);
    const club = await seedClub(db, {
      name: envTest.SEED_CLUB_NAME ?? 'Test Club',
      currencyCode: envTest.SEED_CLUB_CURRENCY ?? 'CZK',
      defaultLocale: envTest.SEED_CLUB_LOCALE ?? 'cs-CZ',
    });
    await seedBankingProfile(db, { clubId: club.id });
    await seedMember(db, {
      clubId: club.id,
      role: 'club_admin',
      email: SHARED_ADMIN.email,
      displayName: SHARED_ADMIN.displayName,
    });

    // Drive the real sign-in form so cookies and the device-PIN row
    // land via the actual production code paths.
    await page.goto('/sign-in');
    await reachPinSetupGate(page, SHARED_ADMIN.email);
    await page.locator('#pin').fill(SETUP_PIN);
    await page.locator('#confirmPin').fill(SETUP_PIN);
    await page.locator('button[type="submit"]').click();
    await page.locator('#pin').waitFor({ state: 'detached', timeout: 15_000 });

    // Sanity: we should be on the authenticated app home.
    await expect(page).toHaveURL(/\/(en|cs)\/?$/);

    // Persist the authenticated context for downstream specs.
    await page.context().storageState({ path: AUTH_STATE_PATH });
  } finally {
    await pool.end();
  }
});
