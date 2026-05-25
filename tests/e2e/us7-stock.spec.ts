import { eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import { beerTypes } from '@/lib/db/schema/catalog';

// US7 — Stock management & low-stock alerts.
//
// Spec 014 (E2E perf) — migrated. Admin (club_admin ≥ stock_manager)
// acts as the stock manager.

test.describe('@us7 stock management', () => {
  test('scenario 1: a stock manager adds a beer type', async ({ page, authed }) => {
    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /add a beer/i }).click();
    await page.locator('#name').fill('Kozel Černý');
    await page.locator('#price').fill('48.00');
    await page.locator('#initialStock').fill('30');
    await page.locator('#lowStockThreshold').fill('5');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect
      .poll(
        async () => {
          const row = await authed.db.query.beerTypes.findFirst({
            where: eq(beerTypes.name, 'Kozel Černý'),
          });
          return row ? `${row.currentStock}:${row.unitPriceMinor}` : null;
        },
        { timeout: 15_000 },
      )
      .toBe('30:4800');
  });

  test('scenario 2: a restock raises the stock level', async ({ page, authed }) => {
    const beer = await authed.seed.beerType({ name: 'Pilsner Urquell', currentStock: 10 });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /^restock$/i }).click();
    await page.locator('#quantity').fill('24');
    await page.getByRole('button', { name: /add to stock/i }).click();

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
      .toBe(34);
  });

  test('scenario 3: an adjustment below zero is rejected', async ({ page, authed }) => {
    const beer = await authed.seed.beerType({ name: 'Radegast', currentStock: 3 });

    await page.goto('/admin/beer-types');
    // Czech label "Upravit stav" disambiguates adjust vs edit (spec 014).
    await page.getByRole('button', { name: /upravit stav|^adjust$/i }).click();
    // v1.3: adjust is a positive quantity + an Add/Remove choice.
    await page.getByRole('button', { name: /take away/i }).click();
    await page.locator('#quantity').fill('5');
    await page.locator('#reason').fill('stocktake correction');
    await page.getByRole('button', { name: /save the change/i }).click();

    await expect(page.getByText(/below zero/i)).toBeVisible();
    // Stock is untouched.
    const row = await authed.db.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(row?.currentStock).toBe(3);
  });

  test('scenario 4: a low-stock beer shows the badge on the log screen', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({ name: 'Budvar', currentStock: 4, lowStockThreshold: 5 });

    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Budvar/ })).toBeVisible();
    await expect(page.getByText(/^Low$/)).toBeVisible();
  });

  test('scenario 5: archiving a beer type hides it from the log screen', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({ name: 'Staropramen', currentStock: 20 });

    // Visible on the log screen before archiving.
    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Staropramen/ })).toBeVisible();

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /^archive$/i }).click();
    await expect(page.getByText(/archived/i).first()).toBeVisible();

    // Gone from the log screen pick list.
    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Staropramen/ })).toHaveCount(0);
  });
});
