import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// Verify chain link 3: the auth fixture.
//
// Proves a seeded member can be driven through the real magic-link
// sign-in + device-PIN setup to an authenticated, unlocked session —
// the precondition every "Given a signed-in member" user-story spec
// depends on.

test.describe('@chain-link-3 auth fixture', () => {
  test('a seeded member can sign in and unlock', async ({ page, seed }) => {
    const club = await seed.club();
    const { member } = await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: 'signin-test@example.test',
    });

    await signInAndUnlock(page, { email: member.email, pin: '4271' });

    // Landed on an authenticated app route — the sign-in form is gone
    // and a protected route is reachable without redirecting away.
    await page.goto('/log');
    await expect(page).toHaveURL(/\/(cs\/)?log$/);
    await expect(page.locator('#email')).toHaveCount(0);
  });
});
