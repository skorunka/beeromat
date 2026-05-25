import { eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import { beerTypes } from '@/lib/db/schema/catalog';

// v1.3 US2 — friendlier stock management (UX review F9/F10).
// Restock is the dominant row action; the adjust flow uses a positive
// quantity + Add/Remove choice — never a signed number.
//
// Spec 014 (E2E perf) — migrated. Admin (club_admin ≥ stock_manager).

test.describe('@ux2-stock friendlier stock management', () => {
  test('scenario 1: Restock is the visually dominant row action', async ({ page, authed }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 10 });

    await page.goto('/admin/beer-types');

    const restock = await page.getByRole('button', { name: 'Restock' }).boundingBox();
    const adjust = await page.getByRole('button', { name: 'Adjust' }).boundingBox();
    expect(restock!.width).toBeGreaterThan(adjust!.width);
  });

  test('scenario 2: the adjust flow has a quantity + Add/Remove, no signed field', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 10 });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: 'Adjust' }).click();

    await expect(page.getByRole('button', { name: 'Add stock' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take away' })).toBeVisible();
    await expect(page.locator('#quantity')).toBeVisible();
    await expect(page.locator('#delta')).toHaveCount(0);
  });

  test('scenario 3: removing more than current stock is rejected in-app', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 10 });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: 'Adjust' }).click();
    await page.getByRole('button', { name: 'Take away' }).click();
    await page.locator('#quantity').fill('50');
    await page.locator('#reason').fill('stocktake');
    await page.getByRole('button', { name: 'Save the change' }).click();

    await expect(page.getByText("That'd take the fridge below zero.")).toBeVisible();
  });

  test('scenario 4: a valid Add and Remove change stock by exactly that amount', async ({
    page,
    authed,
  }) => {
    const beer = await authed.seed.beerType({
      name: 'Kozel',
      unitPriceMinor: 4000n,
      currentStock: 10,
    });

    await page.goto('/admin/beer-types');

    // Add 5 → 15.
    await page.getByRole('button', { name: 'Adjust' }).click();
    await page.getByRole('button', { name: 'Add stock' }).click();
    await page.locator('#quantity').fill('5');
    await page.locator('#reason').fill('found a crate');
    await page.getByRole('button', { name: 'Save the change' }).click();
    await expect
      .poll(
        async () => {
          const row = await authed.db.query.beerTypes.findFirst({
            where: eq(beerTypes.id, beer.id),
          });
          return row?.currentStock ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(15);

    // Remove 3 → 12.
    await page.getByRole('button', { name: 'Adjust' }).click();
    await page.getByRole('button', { name: 'Take away' }).click();
    await page.locator('#quantity').fill('3');
    await page.locator('#reason').fill('breakage');
    await page.getByRole('button', { name: 'Save the change' }).click();
    await expect
      .poll(
        async () => {
          const row = await authed.db.query.beerTypes.findFirst({
            where: eq(beerTypes.id, beer.id),
          });
          return row?.currentStock ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(12);
  });
});
