import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// v1.3 US4 — a member can sign out (UX review F15).

const EMAIL = 'ux2-signout@example.test';
const PIN = '5050';

test.describe('@ux2-sign-out reachable sign-out', () => {
  test('scenario 1: the account hub has a sign-out control', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/account');
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('scenario 2: signing out ends the session', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/account');
    await page.getByRole('button', { name: /sign out/i }).click();

    // The member lands back on the signed-out entry point.
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });
});
