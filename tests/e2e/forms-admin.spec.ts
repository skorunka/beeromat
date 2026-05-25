import { authedTest as test, expect } from './fixtures/test';

// v1.2 US3 — trustworthy admin forms.
// Member invite, banking profile, and the beer-type / restock / adjust forms
// validate in-app, in the active locale, with no native validation bubble.
//
// Spec 014 (E2E perf) — migrated. Admin (club_admin) covers all
// admin/stock-manager scenarios.

test.describe('@forms-admin admin form validation', () => {
  test('scenario 1: member invite rejects a malformed email, role preserved', async ({ page }) => {
    await page.goto('/cs/admin/members');
    // Pick a non-default role first, to prove it survives a failed submit.
    await page.locator('#role').click();
    await page.getByRole('menuitem', { name: 'Pokladník' }).click();

    await page.locator('#email').fill('notanemail');
    await page.getByRole('button', { name: 'Poslat pozvánku' }).click();

    await expect(page.getByText(/Tenhle e.mail nevypadá správně\./)).toBeVisible();
    await expect(page.locator('#role')).toHaveText('Pokladník');
  });

  test('scenario 2: banking rejects a malformed IBAN, other fields preserved', async ({
    page,
  }) => {
    await page.goto('/admin/config');
    await page.locator('#accountHolderName').fill('Club Holder');
    await page.locator('#iban').fill('NOT-AN-IBAN');
    await page.getByRole('button', { name: /save bank details/i }).click();

    await expect(
      page.getByText("That IBAN doesn't look right — double-check it."),
    ).toBeVisible();
    await expect(page.locator('#accountHolderName')).toHaveValue('Club Holder');
  });

  test('scenario 3: restock rejects a non-positive quantity, in Czech', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 10 });

    await page.goto('/cs/admin/beer-types');
    await page.getByRole('button', { name: 'Naskladnit' }).click();
    await page.locator('#quantity').fill('0');
    await page.getByRole('button', { name: 'Přidat na sklad' }).click();

    await expect(page.getByText('Zadej celé číslo větší než nula.')).toBeVisible();
  });

  test('scenario 4: stock adjust needs a reason, in Czech', async ({ page, authed }) => {
    await authed.seed.beerType({ name: 'Kozel', unitPriceMinor: 4000n, currentStock: 10 });

    await page.goto('/cs/admin/beer-types');
    // v1.13 — "Upravit stav" disambiguates adjust vs edit (spec 014 i18n fix).
    await page.getByRole('button', { name: 'Upravit stav' }).click();
    await expect(page.locator('#quantity')).toBeVisible();

    await page.locator('#quantity').fill('5');
    await page.getByRole('button', { name: 'Uložit změnu' }).click();

    await expect(page.getByText('Připoj krátké proč.')).toBeVisible();
  });
});
