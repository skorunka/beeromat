import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US6 (v1.1) — the bet screen guides instead of dead-ending when no
// drink session is open.

const EMAIL = 'ux-bet-nosession@example.test';
const PIN = '7878';

test.describe('@ux-bet-no-session bet screen with no open session', () => {
  test('it explains how to start a session and links to the log screen', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });
    // No drink session seeded — the bet screen must not dead-end.

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });
    await page.goto('/bet');

    // Guidance is shown, not a bare dead end.
    await expect(page.getByText(/a round kicks off when someone logs the first beer/i)).toBeVisible();

    // The "log a beer to start" link goes to the log screen.
    await page.getByRole('link', { name: /log a beer to kick/i }).click();
    await expect(page.getByRole('heading', { name: 'Log a beer' })).toBeVisible();
  });
});
