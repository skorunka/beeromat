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
 * Drive the /sign-in form once: request a magic link, then verify it.
 * Returns true if the verify landed us on the device-PIN gate.
 */
async function requestAndVerifyMagicLink(page: Page, email: string): Promise<boolean> {
  // Drive the sign-in form. The Turnstile test site key
  // (1x00000000000000000000AA) auto-passes, enabling the submit
  // button; wait for that rather than racing it.
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
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

  // Read the freshly-created magic-link token and verify it → Better
  // Auth creates the session cookie and redirects to callbackURL (/).
  const token = await readMagicLinkToken(email);
  await page.goto(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=/`);

  // The device-PIN setup gate (#pin) renders once the session is live.
  // A transient verify failure (e.g. a dropped pooled connection) drops
  // us back on /sign-in instead — the caller retries with a fresh link.
  try {
    await page.locator('#pin').waitFor({ state: 'visible', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign a seeded member in and set their device PIN, leaving `page` on
 * the authenticated app home.
 *
 * The magic-link request/verify is retried: each magic link is single-
 * use and a transient verify failure must restart from a fresh link
 * rather than replay a consumed token. A persistent failure still
 * surfaces — every attempt fails the same way.
 */
export async function signInAndUnlock(
  page: Page,
  opts: { email: string; pin: string },
): Promise<void> {
  if (!/^\d{4}$/.test(opts.pin)) {
    throw new Error('signInAndUnlock: pin must be exactly 4 digits');
  }

  const MAX_ATTEMPTS = 3;
  let reachedPinGate = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !reachedPinGate; attempt += 1) {
    reachedPinGate = await requestAndVerifyMagicLink(page, opts.email);
  }
  if (!reachedPinGate) {
    throw new Error(
      `signInAndUnlock: device-PIN gate never appeared for ${opts.email} ` +
        `after ${MAX_ATTEMPTS} sign-in attempts (last URL: ${page.url()})`,
    );
  }

  // Device-PIN setup gate (first sign-in on this browser → no device
  // session yet → PinGate renders in 'setup' mode).
  await page.locator('#pin').fill(opts.pin);
  await page.locator('#confirmPin').fill(opts.pin);
  await page.locator('button[type="submit"]').click();

  // PinGate reloads the page on success; wait for the app home to
  // settle (the PIN inputs are gone once unlocked).
  await page.locator('#pin').waitFor({ state: 'detached', timeout: 15_000 });
}
