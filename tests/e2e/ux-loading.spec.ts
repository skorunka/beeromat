import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// US8 (v1.1) — navigation shows a loading skeleton, never a frozen
// screen. The destination request is artificially delayed so the
// transient skeleton stays visible long enough to assert.

const EMAIL = 'ux-loading@example.test';
const PIN = '8989';

test.describe('@ux-loading route loading feedback', () => {
  test('navigating to a route shows a loading skeleton', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });
    await page.goto('/');

    // Hold the /history navigation so loading.tsx stays on screen.
    await page.route('**/history**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });

    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();

    // The skeleton (animate-pulse placeholder) is visible during the wait.
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 2000 });

    // …and the real screen arrives once the request completes.
    await expect(page.getByRole('heading', { name: 'My history' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
