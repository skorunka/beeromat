import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// US7 (v1.1) — persistent bottom nav + a single Admin hub.

const ADMIN_EMAIL = 'ux-nav-admin@example.test';
const MEMBER_EMAIL = 'ux-nav-member@example.test';
const PIN = '6767';

test.describe('@ux-navigation persistent nav + admin hub', () => {
  test('scenario 1: daily screens are one tap apart via the bottom nav', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: MEMBER_EMAIL });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: PIN });

    await page.goto('/tab');
    const nav = page.getByRole('navigation');
    await nav.getByRole('link', { name: 'Log' }).click();
    await expect(page.getByRole('heading', { name: 'Log a beer' })).toBeVisible();

    await nav.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'My history' })).toBeVisible();
  });

  test('scenario 2: the Admin hub lists every admin area', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: PIN });

    await page.goto('/admin');
    await expect(page.getByText('Members')).toBeVisible();
    await expect(page.getByText('Banking profile')).toBeVisible();
    await expect(page.getByText('Beer types & stock')).toBeVisible();
  });

  test('scenario 3: a plain member sees no admin entry in the nav', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: MEMBER_EMAIL });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: PIN });
    await page.goto('/');

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Treasurer' })).toHaveCount(0);
    // The daily destinations are present.
    await expect(nav.getByRole('link', { name: 'Log' })).toBeVisible();
  });
});
