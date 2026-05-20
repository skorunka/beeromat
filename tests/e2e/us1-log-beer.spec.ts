import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// US1 — Log a beer and see my running tab.
// Backfills the spec's User Story 1 acceptance scenarios against the
// real app: sign in → log → tab → undo.

const EMAIL = 'us1-member@example.test';
const PIN = '1234';

/**
 * Tap a beer on the log screen and wait for the log to register.
 * BeerGrid fires a `+ <name>` sonner toast on success — waiting for it
 * means the logBeer Server Action has completed before we navigate
 * away (a bare click() does not await the action).
 */
async function logBeer(page: Page, beerName: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(beerName) }).click();
  await expect(page.getByText(`+ ${beerName}`)).toBeVisible();
}

test.describe('@us1 log a beer', () => {
  test('scenario 1+2: signed-in member logs a beer from the log screen', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'club_admin', email: EMAIL });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
      unitPriceMinor: 5200n,
      currentStock: 50,
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // Scenario 1: the log screen is reachable and shows the beer.
    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Pilsner Urquell/ })).toBeVisible();

    // Scenario 2: tapping the beer logs a consumption.
    await logBeer(page, 'Pilsner Urquell');

    // The consumption shows up on the tab.
    await page.goto('/tab');
    await expect(page.getByText('Pilsner Urquell')).toBeVisible();
  });

  test('scenario 3: the tab lists consumptions with a session total', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'club_admin', email: EMAIL });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Kozel',
      unitPriceMinor: 4000n,
      currentStock: 50,
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/log');
    await logBeer(page, 'Kozel');
    await logBeer(page, 'Kozel');

    await page.goto('/tab');
    // Two Kozel entries on the tab.
    await expect(page.getByText('Kozel')).toHaveCount(2);
    // Session total reflects 2 × 40.00 (Czech locale: "80,00 Kč").
    await expect(page.getByText(/80[.,]00/)).toBeVisible();
  });

  test('scenario 4: undo within the window voids the consumption', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({ clubId: club.id, role: 'club_admin', email: EMAIL });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Radegast',
      unitPriceMinor: 3500n,
      currentStock: 50,
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/log');
    await logBeer(page, 'Radegast');

    await page.goto('/tab');
    await expect(page.getByText('Radegast')).toBeVisible();

    // Undo the entry (within the 5-minute self-undo window).
    await page.getByRole('button', { name: /back|zpět|undo/i }).first().click();

    // The session total drops back to zero (Czech: "0,00 Kč").
    await expect(page.getByText(/0[.,]00/)).toBeVisible();
  });
});
