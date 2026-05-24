import { eq, sql } from 'drizzle-orm';
import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { withDb } from './fixtures/test-db';
import { readEnvTest } from './env-test';
import csMessages from '@/messages/cs.json';
import enMessages from '@/messages/en.json';
import { clubs, clubBankingProfiles } from '@/lib/db/schema/clubs';
import { users } from '@/lib/db/schema/auth';
import { members } from '@/lib/db/schema/members';

// Spec 009 — Fresh-install onboarding wizard E2E coverage.
//
// US1: a true-fresh DB → first visitor lands on /setup → submits the
//      wizard → magic-link email arrives in chosen locale → clicking
//      the link promotes them to club_admin (via spec 008's hook) →
//      lands authenticated on the home screen.
// US2: after bootstrap, /setup is unreachable for anyone.
// US3: form validation surfaces inline errors with input preserved.
// US4: wizard renders fully in both supported locales.

const MAILPIT_URL = 'http://localhost:18025';
const DIRECT_URL = readEnvTest().TEST_DATABASE_DIRECT_URL ?? '';

interface MailpitMessage {
  ID: string;
  Subject: string;
}
interface MailpitListResponse {
  messages?: MailpitMessage[];
}

async function clearMailpit(): Promise<void> {
  const r = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`mailpit clear: ${r.status} ${r.statusText}`);
}

async function pollMailpitSubjectFor(to: string, timeoutMs = 8000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const url = `${MAILPIT_URL}/api/v1/messages?query=${encodeURIComponent(`to:${to}`)}`;
  while (Date.now() < deadline) {
    const r = await fetch(url);
    if (r.ok) {
      const data = (await r.json()) as MailpitListResponse;
      const first = data.messages?.[0];
      if (first) return first.Subject;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`mailpit: no message to ${to} within ${timeoutMs}ms`);
}

/** Read the most-recent magic-link token for an email — mirrors the
 *  same query the existing auth fixture uses for sign-in flows. */
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
        /* skip non-JSON verification rows from other flows */
      }
    }
    throw new Error(`onboarding e2e: no magic-link verification row for ${email}`);
  });
}

/** Drive the wizard form. Uses page.goto directly to bypass the
 *  fixture's /en auto-prefix — we want to assert the proxy's own
 *  locale-resolution + redirect behaviour, not the fixture's. */
async function submitWizard(
  page: Page,
  values: { clubName: string; currencyCode: string; defaultLocale: 'cs' | 'en'; adminEmail: string },
): Promise<void> {
  await page.locator('#clubName').fill(values.clubName);
  await page.locator('#currencyCode').fill(values.currencyCode);
  await page.locator('#defaultLocale').selectOption(values.defaultLocale);
  await page.locator('#adminEmail').fill(values.adminEmail);
  await page.locator('button[type="submit"]').click();
}

test.describe('@onboarding spec 009 — fresh-install wizard', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('US1 — fresh DB: visiting any path redirects to /setup; submit creates club + dispatches link; clicking it promotes to club_admin', async ({
    page,
    seed,
  }) => {
    // Fixture truncated already; no seed.* calls — state X.

    // The fixture auto-prefixes /en to bare paths. After the proxy
    // sees state X it redirects to /en/setup (the resolved locale).
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/setup$/);

    // The wizard form is visible. Submit happy values.
    await submitWizard(page, {
      clubName: 'Tenisový klub Šafařík',
      currencyCode: 'czk', // lowercase — the schema transform uppercases
      defaultLocale: 'cs',
      adminEmail: 'pavel@example.test',
    });

    // The form redirects to /sign-in?bootstrap-sent=1 on success.
    await page.waitForURL(/\/sign-in\?bootstrap-sent=1/, { timeout: 10_000 });

    // DB state: clubs row + banking profile + users row (emailVerified=false).
    const clubRows = await seed.db.select().from(clubs);
    expect(clubRows).toHaveLength(1);
    expect(clubRows[0]).toMatchObject({
      name: 'Tenisový klub Šafařík',
      currencyCode: 'CZK', // canonicalised by the schema transform
      defaultLocale: 'cs',
    });
    const bankingRows = await seed.db.select().from(clubBankingProfiles);
    expect(bankingRows).toHaveLength(1);
    expect(bankingRows[0]?.iban).toBeNull();
    const userRows = await seed.db.select().from(users);
    expect(userRows).toHaveLength(1);
    expect(userRows[0]).toMatchObject({
      email: 'pavel@example.test',
      emailVerified: false,
    });
    // Members not yet inserted — promotion happens at verify time.
    expect(await seed.db.select().from(members)).toHaveLength(0);

    // Email arrived at Mailpit in Czech (the chosen defaultLocale).
    const subject = await pollMailpitSubjectFor('pavel@example.test');
    expect(subject).toBe(csMessages.emails.magicLink.subject);

    // Click the magic link → spec 008's promotion hook fires.
    const token = await readMagicLinkToken('pavel@example.test');
    await page.goto(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=/en`,
    );

    // Members row now exists with club_admin role.
    await expect
      .poll(
        async () => {
          const r = await seed.db.query.members.findFirst({
            where: eq(members.email, 'pavel@example.test'),
          });
          return r?.role ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe('club_admin');
  });

  test('US1 — choosing en as defaultLocale dispatches an English magic-link email', async ({
    page,
    seed,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/setup$/);

    await submitWizard(page, {
      clubName: 'Riverside Tennis',
      currencyCode: 'EUR',
      defaultLocale: 'en',
      adminEmail: 'admin-en@example.test',
    });

    await page.waitForURL(/\/sign-in\?bootstrap-sent=1/, { timeout: 10_000 });

    const subject = await pollMailpitSubjectFor('admin-en@example.test');
    expect(subject).toBe(enMessages.emails.magicLink.subject);

    // Sanity — the row landed with EUR / en too.
    expect(await seed.db.select().from(clubs)).toMatchObject([
      { currencyCode: 'EUR', defaultLocale: 'en' },
    ]);
  });

  test('US2 — anonymous visit to /setup post-bootstrap redirects to /sign-in', async ({
    page,
    seed,
  }) => {
    // Seed into state B (club + admin member exist) so the proxy
    // observes a populated deployment.
    const club = await seed.club({ name: 'Bootstrapped Club' });
    await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: 'someone@example.test',
      displayName: 'Someone',
    });

    // Anonymous (no auth cookies) → /sign-in.
    await page.goto('/setup');
    await expect(page).toHaveURL(/\/sign-in$/);

    // Also for the english-prefixed form.
    await page.goto('/en/setup');
    await expect(page).toHaveURL(/\/en\/sign-in$/);

    // And the czech-prefixed form (czech default → unprefixed
    // /sign-in for the resolved-locale=cs branch).
    await page.goto('/cs/setup');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('US2 — signed-in member visit to /setup post-bootstrap redirects to /', async ({
    page,
    seed,
  }) => {
    const club = await seed.club({ name: 'Members Club' });
    await seed.member({
      clubId: club.id,
      role: 'member',
      email: 'regular@example.test',
      displayName: 'Regular',
    });

    await signInAndUnlock(page, { email: 'regular@example.test', pin: '4271' });

    await page.goto('/setup');
    // Resolved locale is `en` here because the suite's signIn flow
    // happens through the /en-prefixed fixture; the proxy redirects
    // to /en (or /) rather than to /setup.
    await expect(page).not.toHaveURL(/\/setup$/);
  });

  test('US3 — bad currency: inline error renders + no rows inserted', async ({ page, seed }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/setup$/);

    // Fill happy-path values for three fields; corrupt the currency.
    await page.locator('#clubName').fill('Validation Test Club');
    await page.locator('#currencyCode').fill('CZ'); // 2 letters → rejected
    await page.locator('#defaultLocale').selectOption('cs');
    await page.locator('#adminEmail').fill('valid@example.test');
    await page.locator('button[type="submit"]').click();

    // Inline error renders against the English catalog (the suite runs
    // /en). FormMessage attaches as <p> under the currency field.
    await expect(page.getByText(enMessages.onboarding.errors.currencyInvalid)).toBeVisible();

    // Stayed on /setup — no redirect.
    await expect(page).toHaveURL(/\/en\/setup$/);

    // Other fields' values preserved.
    await expect(page.locator('#clubName')).toHaveValue('Validation Test Club');
    await expect(page.locator('#adminEmail')).toHaveValue('valid@example.test');

    // Zero side effects.
    expect(await seed.db.select().from(clubs)).toHaveLength(0);
    expect(await seed.db.select().from(users)).toHaveLength(0);
  });

  test('US4 — /cs/setup renders Czech labels; switching to EN flips to /en/setup', async ({
    page,
  }) => {
    // Goto /cs/setup explicitly — the suite's page.goto wrapper only
    // auto-prefixes /en on paths NOT already starting with /cs or /en.
    // With localePrefix: 'as-needed', the URL normalises to /setup
    // (cs is unprefixed), but the rendered locale is Czech.
    await page.goto('/cs/setup');

    await expect(
      page.getByRole('heading', { name: csMessages.onboarding.title }),
    ).toBeVisible();

    // Click the EN button in the LanguageSwitcher → flips URL to
    // /en/setup and re-renders the form in English.
    await page.getByRole('button', { name: 'EN' }).click();
    await page.waitForURL(/\/en\/setup$/, { timeout: 5_000 });
    await expect(
      page.getByRole('heading', { name: enMessages.onboarding.title }),
    ).toBeVisible();
  });
});
