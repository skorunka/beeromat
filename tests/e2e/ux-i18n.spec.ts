import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US1 (v1.1) — the UI renders fully in Czech and in English.
// The suite runs in English by default (see the page fixture); these
// specs visit explicit /en and /cs paths to check both catalogs.

const EMAIL = 'ux-i18n@example.test';
const PIN = '1212';

test.describe('@ux-i18n bilingual UI', () => {
  test('scenario 1: screens render in English', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/en/log');
    await expect(page.getByRole('heading', { name: 'Log a beer' })).toBeVisible();

    await page.goto('/en/admin/pending');
    await expect(page.getByRole('heading', { name: 'To confirm' })).toBeVisible();
  });

  test('scenario 2: screens render in Czech', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/cs/log');
    await expect(page.getByRole('heading', { name: 'Zapsat pivo' })).toBeVisible();

    await page.goto('/cs/admin/pending');
    await expect(page.getByRole('heading', { name: 'K potvrzení' })).toBeVisible();
    // No raw catalog keys leak onto the page.
    await expect(page.locator('body')).not.toContainText('treasurer.');
  });
});
