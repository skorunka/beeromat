import { sql } from 'drizzle-orm';
import type { Page } from '@playwright/test';

import { readEnvTest } from '../env-test';
import { withDb } from './test-db';

// E2E auth helper — gives a Playwright `page` an authenticated +
// PIN-unlocked session for a member that has already been seeded.
//
// How it works (zero production-code coupling):
//   1. Drive the real /sign-in form → triggers requestMagicLinkAction
//      → Better Auth's magic-link plugin stores a verification row.
//   2. Better Auth (v1.6, default config — we don't set
//      storeToken:'hashed') stores the RAW token in
//      verification.identifier, with value = JSON {email,name}.
//      The fixture reads that row directly via the test DB connection.
//   3. Navigate to the magic-link verify URL → Better Auth creates the
//      session cookie.
//   4. Complete the device-PIN setup gate.
// The result is a fully authenticated, unlocked browser context — the
// precondition every "Given a signed-in member" spec needs.

const envTest = readEnvTest();
const DIRECT_URL = envTest.TEST_DATABASE_DIRECT_URL ?? '';

/** Read the most-recent magic-link token for an email from Better
 *  Auth's `verification` table. */
async function readMagicLinkToken(email: string): Promise<string> {
  return withDb(DIRECT_URL, async (db) => {
    const res = await db.execute<{ identifier: string; value: string }>(
      sql.raw('SELECT identifier, value FROM verification ORDER BY created_at DESC LIMIT 25'),
    );
    for (const row of res.rows) {
      try {
        const parsed = JSON.parse(row.value) as { email?: string };
        if (parsed.email?.toLowerCase() === email.toLowerCase()) {
          return row.identifier;
        }
      } catch {
        // verification rows from other flows may not be JSON — skip.
      }
    }
    throw new Error(`auth fixture: no magic-link verification row found for ${email}`);
  });
}

/**
 * Sign a seeded member in and set their device PIN, leaving `page` on
 * the authenticated app home.
 */
export async function signInAndUnlock(
  page: Page,
  opts: { email: string; pin: string },
): Promise<void> {
  if (!/^\d{4}$/.test(opts.pin)) {
    throw new Error('signInAndUnlock: pin must be exactly 4 digits');
  }

  // 1. Drive the sign-in form. The Turnstile test site key
  //    (1x00000000000000000000AA) auto-passes, enabling the submit
  //    button; wait for that rather than racing it.
  await page.goto('/sign-in');
  await page.locator('#email').fill(opts.email);
  const submit = page.locator('button[type="submit"]');
  await submit.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    { timeout: 15_000 },
  );
  await submit.click();

  // Wait for requestMagicLinkAction to COMPLETE before reading the DB.
  // On success SignInForm swaps the form for a "link sent" screen, so
  // the #email input detaches — that's our signal the Server Action
  // (which stores the verification row) has finished. Reading the
  // token before this point is a race.
  await page.locator('#email').waitFor({ state: 'detached', timeout: 15_000 });

  // 2. Read the freshly-created magic-link token from the DB.
  const token = await readMagicLinkToken(opts.email);

  // 3. Verify the magic link → Better Auth creates the session cookie
  //    and redirects to callbackURL (/).
  await page.goto(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=/`);

  // 4. Device-PIN setup gate (first sign-in on this browser → no
  //    device session yet → PinGate renders in 'setup' mode).
  await page.locator('#pin').waitFor({ state: 'visible' });
  await page.locator('#pin').fill(opts.pin);
  await page.locator('#confirmPin').fill(opts.pin);
  await page.locator('button[type="submit"]').click();

  // PinGate reloads the page on success; wait for the app home to
  // settle (the PIN inputs are gone once unlocked).
  await page.locator('#pin').waitFor({ state: 'detached', timeout: 15_000 });
}
