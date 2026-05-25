import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import csMessages from '@/messages/cs.json';
import enMessages from '@/messages/en.json';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// Spec 007 — Localized transactional emails.
//
// Tests the WIRING (locale → catalog key → email subject), not the
// copy itself. For each of the two transactional emails (magic-link,
// invitation) and each of the two locales (cs, en), we drive the real
// user flow, then read the dispatched message from Mailpit's HTTP API
// and assert the Subject equals the catalog value.
//
// Reading the catalog at test time means the test rewires automatically
// whenever the copy is updated — it can never go stale against the copy
// it claims to test. What it CAN catch is a regression in the locale
// resolution chain: a callback that drops the locale, a mailer that
// forgets to pass it on, a hardcoded language anywhere along the way.
//
// Copy quality and visual layout — what an automated test cannot judge —
// stay with the manual Mailpit exercise in tasks.md T011.

const MAILPIT_URL = 'http://localhost:18025';

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

/** Poll Mailpit's HTTP API for a message addressed to `to` (query
 *  filter on the To header). Returns the first match's Subject as the
 *  list endpoint already exposes it — no second round-trip needed. */
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

/** Drive /{locale}/sign-in for an allowlisted email — direct goto
 *  bypasses the suite's /en auto-prefix. */
async function requestMagicLinkVia(page: Page, locale: 'cs' | 'en', email: string): Promise<void> {
  await page.goto(`/${locale}/sign-in`);
  await page.locator('#email').fill(email);
  // Wait for the Turnstile test key to unlock the submit button.
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    { timeout: 15_000 },
  );
  await page.locator('button[type="submit"]').click();
  // SignInForm swaps the form for a "Link sent" screen on success — the
  // detach of #email is our signal that requestMagicLinkAction finished
  // (and the mailer call inside it has either dispatched or fallen back).
  await page.locator('#email').waitFor({ state: 'detached', timeout: 15_000 });
}

test.describe('@email-i18n spec 007 — locale → email subject wiring', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  for (const locale of ['cs', 'en'] as const) {
    test(`magic-link email subject is the ${locale} catalog value`, async ({ page, seed }) => {
      const club = await seed.club();
      const { member } = await seed.member({
        clubId: club.id,
        email: `magic-${locale}@example.test`,
      });

      await requestMagicLinkVia(page, locale, member.email);

      const subject = await pollMailpitSubjectFor(member.email);
      const expected = (locale === 'cs' ? csMessages : enMessages).emails.magicLink.subject;
      expect(subject).toBe(expected);
    });
  }

  for (const locale of ['cs', 'en'] as const) {
    test(`invitation email subject is the ${locale} catalog value`, async ({ page, seed }) => {
      const club = await seed.club({ name: 'Test Klub' });
      const adminEmail = `admin-i18n-${locale}@example.test`;
      await seed.member({
        clubId: club.id,
        role: 'club_admin',
        email: adminEmail,
        displayName: 'Test Admin',
      });

      // Admin signs in via the suite's English fixture (the magic-link
      // for sign-in itself is irrelevant here — we clear the inbox right
      // after). The invitation email's locale is determined by the URL
      // prefix of the page that invokes inviteMemberAction.
      await signInAndUnlock(page, { email: adminEmail, pin: '4271' });
      await clearMailpit();

      const inviteeEmail = `invitee-i18n-${locale}@example.test`;
      await page.goto(`/${locale}/admin/members`);
      await page.locator('#email').fill(inviteeEmail);
      await page.locator('button[type="submit"]').click();

      const subject = await pollMailpitSubjectFor(inviteeEmail);
      const expected = (locale === 'cs' ? csMessages : enMessages).emails.invitation.subject
        .replace('{inviterName}', 'Test Admin')
        .replace('{clubName}', 'Test Klub');
      expect(subject).toBe(expected);
    });
  }
});
