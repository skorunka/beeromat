import { authedTest as test, expect } from './fixtures/test';
import type { AuthedContext } from './fixtures/test';

// v1.2 US2 — trustworthy money forms.
// The settle "paid another way" form and the treasurer manual-payment form
// validate amounts and notes in-app, in the active locale, with no native
// validation bubble.
//
// Spec 014 (E2E perf) — migrated. Admin acts as both treasurer (for
// scenarios 1, 4) and as the settling member (scenarios 2, 3 —
// admin's tab accumulates from seeded consumptions).

const VALID_IBAN = 'CZ6508000000192000145399';

async function seedKarelWithBalance(
  authed: AuthedContext,
  count: number,
): Promise<{ memberId: string }> {
  const karel = await authed.seedExtraMember({ role: 'member', displayName: 'Karel' });
  const beer = await authed.seed.beerType({
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await authed.seed.drinkSession();
  for (let i = 0; i < count; i += 1) {
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: karel.memberId,
      beerTypeId: beer.id,
      createdByUserId: karel.userId,
      unitPriceMinorSnapshot: 5000n,
    });
  }
  return { memberId: karel.memberId };
}

async function seedAdminBalance(authed: AuthedContext, count: number): Promise<void> {
  const beer = await authed.seed.beerType({
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await authed.seed.drinkSession();
  for (let i = 0; i < count; i += 1) {
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: authed.admin.memberId,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
    });
  }
}

test.describe('@forms-money money form validation', () => {
  test('scenario 1: manual payment rejects a non-numeric amount, in Czech', async ({
    page,
    authed,
  }) => {
    const karel = await seedKarelWithBalance(authed, 2);

    await page.goto(`/cs/admin/balances/${karel.memberId}`);
    await page.locator('#amount').fill('abc');
    await page.getByRole('button', { name: 'Označit jako zaplaceno' }).click();

    await expect(page.getByText('Zadej platnou částku.')).toBeVisible();
    await expect(page.locator('form')).toHaveAttribute('novalidate', '');
  });

  test('scenario 2: settle "paid another way" needs a note, in Czech', async ({
    page,
    authed,
  }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });
    await seedAdminBalance(authed, 2);

    await page.goto('/cs/settle');
    await page.getByRole('button', { name: 'Zaplaceno jinak? (hotově, převodem)' }).click();
    await page.getByRole('button', { name: 'Označit jako zaplaceno' }).click();

    await expect(
      page.getByText('Připoj krátkou poznámku (třeba „hotově pokladníkovi“).'),
    ).toBeVisible();
  });

  test('scenario 3: settle "paid another way" rejects a zero amount', async ({
    page,
    authed,
  }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });
    await seedAdminBalance(authed, 2);

    await page.goto('/settle');
    await page
      .getByRole('button', { name: 'Paid another way? (cash, direct transfer)' })
      .click();
    await page.locator('#amount').fill('0');
    await page.locator('#note').fill('cash to the treasurer');
    await page.getByRole('button', { name: 'Mark it paid' }).click();

    await expect(page.getByText('Pop in a real amount.')).toBeVisible();
  });

  test('scenario 4: a valid manual payment records', async ({ page, authed }) => {
    const karel = await seedKarelWithBalance(authed, 2);

    await page.goto(`/admin/balances/${karel.memberId}`);
    await page.locator('#amount').fill('60');
    await page.getByRole('button', { name: 'Mark it paid' }).click();

    // On success the form resets — the amount field clears.
    await expect(page.locator('#amount')).toHaveValue('', { timeout: 15_000 });
  });
});
