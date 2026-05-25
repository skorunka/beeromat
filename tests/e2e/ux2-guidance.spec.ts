import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// v1.3 US5 — clearer empty states and guidance (UX review F16, F19).

const EMAIL = 'ux2-guidance@example.test';
const PIN = '6060';

test.describe('@ux2-guidance empty states & guidance', () => {
  test('scenario 1: the log screen shows a friendly empty state', async ({ page, seed }) => {
    const club = await seed.club();
    // No beer types seeded — the log screen must not be a bleak empty grid.
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/log');
    await expect(page.getByText(/no beers in the fridge yet/i)).toBeVisible();
  });

  test('scenario 2: the dispute banner offers an actionable next step', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: EMAIL,
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // The dispute banner renders on protected pages.
    await page.goto('/');
    const banner = page.getByText(/got flagged/i);
    await expect(banner).toBeVisible();
    // It offers a link to act on it, not just an explanation.
    await expect(page.getByRole('link', { name: /sort it out/i })).toBeVisible();
  });
});
