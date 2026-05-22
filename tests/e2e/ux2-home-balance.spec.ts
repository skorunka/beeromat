import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// v1.3 US3 — the home balance reflects a just-logged beer (UX review F2).

const EMAIL = 'ux2-balance@example.test';
const PIN = '4040';

test.describe('@ux2-home-balance live home balance', () => {
  test('scenario 1: logging a beer raises the home balance', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'member', email: EMAIL });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
      unitPriceMinor: 5000n,
      currentStock: 50,
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // Home balance starts at zero.
    await page.goto('/');
    await expect(page.getByText(/0[.,]00/)).toBeVisible();

    // Log a beer.
    await page.goto('/log');
    await page.getByRole('button', { name: /Pilsner Urquell/ }).click();
    await expect(page.getByText('+ Pilsner Urquell')).toBeVisible({ timeout: 15_000 });

    // Back on home, the balance now includes the 50.00 beer.
    await page.goto('/');
    await expect(page.getByText(/50[.,]00/)).toBeVisible();
  });

  test('scenario 2: undoing a beer drops the home balance back', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'member', email: EMAIL });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
      unitPriceMinor: 5000n,
      currentStock: 50,
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/log');
    await page.getByRole('button', { name: /Pilsner Urquell/ }).click();
    await expect(page.getByText('+ Pilsner Urquell')).toBeVisible({ timeout: 15_000 });

    // Undo the consumption from the tab.
    await page.goto('/tab');
    await expect(page.getByText('Pilsner Urquell')).toBeVisible();
    await page.getByRole('button', { name: /back|zpět|undo/i }).first().click();
    // The tab's session total drops back to zero — the void has landed.
    await expect(page.getByText(/0[.,]00/)).toBeVisible({ timeout: 15_000 });

    // Home balance reflects the removal.
    await page.goto('/');
    await expect(page.getByText(/0[.,]00/)).toBeVisible();
  });
});
