import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// US5 (v1.1) — a forgotten-PIN escape on the unlock screen.

const EMAIL = 'ux-forgot-pin@example.test';
const PIN = '5656';

test.describe('@ux-forgot-pin recover a forgotten PIN', () => {
  test('forgot-PIN from the unlock screen routes to sign-in, no attempts spent', async ({
    page,
    seed,
  }) => {
    // A 1-second inactivity window so the device goes stale (→ unlock
    // screen) right after sign-in, without waiting hours.
    const club = await seed.club({ deviceInactivityLockSeconds: 1 });
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // Let the device session go stale, then return — the PIN gate now
    // renders in unlock mode.
    await page.waitForTimeout(1500);
    await page.goto('/');
    await expect(page.locator('#pin')).toBeVisible();
    // Unlock mode has no confirm-PIN field (that is setup mode).
    await expect(page.locator('#confirmPin')).toHaveCount(0);

    // The forgot-PIN affordance is present before any lock-out.
    await page.getByRole('button', { name: /forgot pin/i }).click();

    // It routes to the sign-in screen to request a fresh magic link.
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });
});
