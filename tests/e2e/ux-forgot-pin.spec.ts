import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { deviceSessions } from '@/lib/db/schema/members';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US5 (v1.1) — a forgotten-PIN escape on the unlock screen.

const EMAIL = 'ux-forgot-pin@example.test';
const PIN = '5656';

test.describe('@ux-forgot-pin recover a forgotten PIN', () => {
  test('forgot-PIN from the unlock screen routes to sign-in, no attempts spent', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // Age the device session past the inactivity window directly — the
    // PIN gate then renders in unlock mode on the next load. (Doing this
    // by waiting real time would also delay signInAndUnlock itself.)
    await seed.db
      .update(deviceSessions)
      .set({ lastUnlockAt: new Date(0) })
      .where(eq(deviceSessions.userId, user.id));

    await page.goto('/');
    await expect(page.locator('#pin')).toBeVisible();
    // Unlock mode has no confirm-PIN field (that is setup mode).
    await expect(page.locator('#confirmPin')).toHaveCount(0);

    // The forgot-PIN affordance is present before any lock-out.
    await page.getByRole('button', { name: /forgot/i }).click();

    // It routes to the sign-in screen to request a fresh magic link.
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });
});
