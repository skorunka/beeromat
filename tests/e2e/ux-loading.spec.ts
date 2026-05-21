import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// US8 (v1.1) — navigation shows a loading skeleton, never a frozen
// screen. The destination's data fetch is held so the transient
// skeleton (loading.tsx) stays visible long enough to assert.

const EMAIL = 'ux-loading@example.test';
const PIN = '8989';

test.describe('@ux-loading route loading feedback', () => {
  test('navigating to a route shows a loading skeleton', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });
    await page.goto('/');
    // Wait until the app is hydrated, so clicking the nav is a
    // client-side navigation (which renders loading.tsx) — not a full
    // page load (which would just hold on the old page).
    await page.waitForLoadState('networkidle');

    // Hold the /history navigation so loading.tsx stays on screen.
    await page.route('**/history**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });

    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();

    // The URL commits to /history while the data is still loading…
    await page.waitForURL(/\/history/, { timeout: 10_000 });
    // …and the skeleton (animate-pulse placeholder) is on screen.
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 8000 });

    // Once the held request completes, the real screen arrives.
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
