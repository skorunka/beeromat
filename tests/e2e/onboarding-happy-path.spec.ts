import { test, expect } from '@playwright/test';

import { countRows, getOneRow, truncateAll } from './helpers/db';

// Spec 016 — the one E2E happy-path test for onboarding.
//
// Acceptance scenarios (from spec.md US1):
//   1. Fresh DB → visit / → redirected to /{locale}/setup.
//   2. Fill all four fields and submit → /sign-in?bootstrap-sent=1.
//   3. DB state after submit: 1 club, 1 banking_profile,
//      1 user (emailVerified=false), 1 verification row.
//
// Anything beyond this (the magic-link click + auto-promotion to
// club_admin + landing on home) is OUT OF SCOPE per spec 016 — see
// the spec for the v2 extension note.

const DIRECT_URL =
  process.env.TEST_DATABASE_DIRECT_URL ??
  'postgresql://beeromat:beeromat@localhost:15432/beeromat_test';

const CLUB_NAME = 'Spec 016 Happy Path FC';
const CURRENCY = 'CZK';
const LOCALE = 'cs';
const ADMIN_EMAIL = 'spec016-admin@example.test';

test.beforeAll(async () => {
  // The fixture assumes the schema is already in the test DB
  // (`pnpm db:migrate` against .env.test, or a long-running
  // docker-compose stack). On a wiped volume the truncate call
  // throws a "relation X does not exist" — the operator must
  // migrate once. Documented in plan.md's Risk section.
  await truncateAll(DIRECT_URL);
});

test('@onboarding happy path: zero-state → wizard → link sent → DB row invariant', async ({
  page,
}) => {
  // 1. Visiting any path on a fresh DB lands on /setup. The default
  //    locale (cs) has no URL prefix under next-intl's `as-needed`
  //    policy, so `/setup` and `/en/setup` are both valid landings.
  await page.goto('/');
  await expect(page).toHaveURL(/(\/(cs|en))?\/setup$/);

  // 2. Fill + submit. Field selectors are the `name` props on the
  //    shadcn <FormField> components — react-hook-form maps them to
  //    DOM `name`/`id` attributes one-for-one.
  await page.locator('[name="clubName"]').fill(CLUB_NAME);
  await page.locator('[name="currencyCode"]').fill(CURRENCY);
  await page.locator('[name="defaultLocale"]').selectOption(LOCALE);
  await page.locator('[name="adminEmail"]').fill(ADMIN_EMAIL);
  await page.locator('button[type="submit"]').click();

  // 3. Redirect to the "link sent" gate.
  await page.waitForURL(/\/sign-in\?bootstrap-sent=1/, { timeout: 15_000 });

  // 4. DB-state invariant — the four rows the bootstrap transaction
  //    must have written, no more, no less.
  expect(await countRows(DIRECT_URL, 'clubs')).toBe(1);
  expect(await countRows(DIRECT_URL, 'club_banking_profiles')).toBe(1);
  // Better Auth uses singular table names — `user` is a SQL reserved
  // word and the count helper quotes the identifier for us.
  expect(await countRows(DIRECT_URL, 'user')).toBe(1);
  expect(await countRows(DIRECT_URL, 'verification')).toBeGreaterThanOrEqual(1);

  const club = await getOneRow<{ name: string; currency_code: string; default_locale: string }>(
    DIRECT_URL,
    `SELECT name, currency_code, default_locale FROM clubs LIMIT 1`,
  );
  expect(club?.name).toBe(CLUB_NAME);
  expect(club?.currency_code).toBe(CURRENCY);
  // The bootstrap transaction stores the form value verbatim — the
  // form sends `cs`/`en` (the routing.locales values), not BCP-47.
  expect(club?.default_locale).toBe(LOCALE);

  const user = await getOneRow<{ email: string; email_verified: boolean }>(
    DIRECT_URL,
    `SELECT email, email_verified FROM "user" LIMIT 1`,
  );
  expect(user?.email).toBe(ADMIN_EMAIL);
  expect(user?.email_verified).toBe(false);
});
