import type { Page } from '@playwright/test';

import { authedTest as test, expect } from './fixtures/test';

// US1 — Log a beer and see my running tab.
//
// Spec 014 (E2E perf) — migrated to authedTest. The shared admin
// logs against their own tab; truncateDomainOnly resets domain rows
// (consumptions/sessions) between tests.

async function logBeer(page: Page, beerName: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(beerName) }).click();
  await expect(page.getByText(`+ ${beerName}`)).toBeVisible({ timeout: 15_000 });
}

test.describe('@us1 log a beer', () => {
  test('scenario 1+2: signed-in member logs a beer from the log screen', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({
      name: 'Pilsner Urquell',
      unitPriceMinor: 5200n,
      currentStock: 50,
    });

    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Pilsner Urquell/ })).toBeVisible();
    await logBeer(page, 'Pilsner Urquell');

    await page.goto('/tab');
    await expect(page.getByText('Pilsner Urquell')).toBeVisible();
  });

  test('scenario 3: the tab lists consumptions with a session total', async ({ page, authed }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 50 });

    await page.goto('/log');
    await logBeer(page, 'Kozel');
    await logBeer(page, 'Kozel');

    await page.goto('/tab');
    await expect(page.getByText('Kozel')).toHaveCount(2);
    await expect(page.getByText(/80[.,]00/)).toBeVisible();
  });

  test('scenario 4: undo within the window voids the consumption', async ({ page, authed }) => {
    await authed.seed.beerType({ name: 'Radegast', unitPriceMinor: 3500n, currentStock: 50 });

    await page.goto('/log');
    await logBeer(page, 'Radegast');

    await page.goto('/tab');
    await expect(page.getByText('Radegast')).toBeVisible();

    await page.getByRole('button', { name: /back|zpět|undo/i }).first().click();
    await expect(page.getByText(/0[.,]00/)).toBeVisible({ timeout: 15_000 });
  });
});
