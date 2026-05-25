import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { beerTypes } from '@/lib/db/schema/catalog';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US7 — Stock management & low-stock alerts.
// Backfills User Story 7: a stock manager maintains the beer catalog;
// the log screen reflects low-stock and archived state.

const MANAGER_EMAIL = 'us7-stock@example.test';
const MANAGER_PIN = '7070';

test.describe('@us7 stock management', () => {
  test('scenario 1: a stock manager adds a beer type', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'stock_manager', email: MANAGER_EMAIL });

    await signInAndUnlock(page, { email: MANAGER_EMAIL, pin: MANAGER_PIN });

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
          const row = await seed.db.query.beerTypes.findFirst({
            where: eq(beerTypes.name, 'Kozel Černý'),
          });
          return row ? `${row.currentStock}:${row.unitPriceMinor}` : null;
        },
        { timeout: 15_000 },
      )
      .toBe('30:4800');
  });

  test('scenario 2: a restock raises the stock level', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: MANAGER_EMAIL,
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
      currentStock: 10,
    });

    await signInAndUnlock(page, { email: MANAGER_EMAIL, pin: MANAGER_PIN });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /^restock$/i }).click();
    await page.locator('#quantity').fill('24');
    await page.getByRole('button', { name: /add to stock/i }).click();

    await expect
      .poll(
        async () => {
          const row = await seed.db.query.beerTypes.findFirst({
            where: eq(beerTypes.id, beer.id),
          });
          return row?.currentStock ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(34);
  });

  test('scenario 3: an adjustment below zero is rejected', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: MANAGER_EMAIL,
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Radegast',
      currentStock: 3,
    });

    await signInAndUnlock(page, { email: MANAGER_EMAIL, pin: MANAGER_PIN });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /^adjust$/i }).click();
    // v1.3: adjust is a positive quantity + an Add/Remove choice.
    await page.getByRole('button', { name: /take away/i }).click();
    await page.locator('#quantity').fill('5');
    await page.locator('#reason').fill('stocktake correction');
    await page.getByRole('button', { name: /save the change/i }).click();

    await expect(page.getByText(/below zero/i)).toBeVisible();
    // Stock is untouched.
    const row = await seed.db.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(row?.currentStock).toBe(3);
  });

  test('scenario 4: a low-stock beer shows the badge on the log screen', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: MANAGER_EMAIL,
    });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Budvar',
      currentStock: 4,
      lowStockThreshold: 5,
    });

    await signInAndUnlock(page, { email: MANAGER_EMAIL, pin: MANAGER_PIN });

    await page.goto('/log');
    await expect(page.getByRole('button', { name: /Budvar/ })).toBeVisible();
    await expect(page.getByText(/^Low$/)).toBeVisible();
  });

  test('scenario 5: archiving a beer type hides it from the log screen', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: MANAGER_EMAIL,
    });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Staropramen',
      currentStock: 20,
    });

    await signInAndUnlock(page, { email: MANAGER_EMAIL, pin: MANAGER_PIN });

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
