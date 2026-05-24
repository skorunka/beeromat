import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { beerTypes } from '@/lib/db/schema/catalog';

// Spec 011 — beer buy-price + margin tracking E2E coverage.

const ADMIN_EMAIL = 'buyprice-admin@example.test';
const PIN = '4271';
const MEMBER_EMAIL = 'buyprice-member@example.test';

test.describe('@buy-price spec 011 — beer buy-price + margin', () => {
  test('US1 + US2: admin adds beer with buy price; per-unit margin + club margin visible', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: PIN });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /add a beer/i }).click();
    await page.locator('#name').fill('Pilsner');
    await page.locator('#price').fill('60.00');
    await page.locator('#buyPrice').fill('40.00');
    await page.locator('#initialStock').fill('20');
    await page.locator('#lowStockThreshold').fill('5');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Row persisted with buyPriceMinor set.
    await expect
      .poll(async () => {
        const row = await seed.db.query.beerTypes.findFirst({
          where: eq(beerTypes.name, 'Pilsner'),
        });
        return row?.buyPriceMinor?.toString() ?? null;
      })
      .toBe('4000');

    // Per-unit margin row rendered against the new beer card.
    await expect(page.getByText(/buy.*margin/i).first()).toBeVisible();
  });

  test('US1 scenario 4: sell-below-buy submission shows inline error, no row inserted', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: PIN });

    await page.goto('/admin/beer-types');
    await page.getByRole('button', { name: /add a beer/i }).click();
    await page.locator('#name').fill('BadConfig');
    await page.locator('#price').fill('30.00');
    await page.locator('#buyPrice').fill('50.00'); // > sell
    await page.locator('#initialStock').fill('5');
    await page.locator('#lowStockThreshold').fill('1');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Inline error visible against the buy-price field.
    await expect(
      page.getByText(/Sell price must be at least the buy price|alespoň nákupní cena/),
    ).toBeVisible();

    // No row inserted.
    const row = await seed.db.query.beerTypes.findFirst({
      where: eq(beerTypes.name, 'BadConfig'),
    });
    expect(row).toBeUndefined();
  });

  test('US3: regular member on /log sees no buy price or margin', async ({ page, seed }) => {
    const club = await seed.club();
    const { user: adminUser } = await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: 'margin-admin@example.test',
    });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: adminUser.id,
      name: 'Members See Sell Only',
      unitPriceMinor: 6000n,
      currentStock: 10,
    });
    await seed.member({ clubId: club.id, role: 'member', email: MEMBER_EMAIL });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: PIN });
    await page.goto('/log');

    // No "club margin" / margin row anywhere on /log.
    await expect(page.getByText(/Club margin|Klubový marže/)).toHaveCount(0);
    await expect(page.getByText(/buy.*margin/i)).toHaveCount(0);
  });
});
