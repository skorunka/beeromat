import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// v1.2 US3 — trustworthy admin forms.
// Member invite, banking profile, and the beer-type / restock / adjust forms
// validate in-app, in the active locale, with no native validation bubble.
// Acceptance scenarios from spec.md US3.

const ADMIN_EMAIL = 'forms-us3-admin@example.test';
const ADMIN_PIN = '8642';

test.describe('@forms-admin admin form validation', () => {
  test('scenario 1: member invite rejects a malformed email, role preserved', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/cs/admin/members');
    // Pick a non-default role first, to prove it survives a failed submit.
    await page.locator('#role').click();
    await page.getByRole('menuitem', { name: 'treasurer' }).click();

    await page.locator('#email').fill('notanemail');
    await page.getByRole('button', { name: 'Poslat pozvánku' }).click();

    await expect(page.getByText('Tenhle e-mail nevypadá správně.')).toBeVisible();
    // The chosen role is not lost.
    await expect(page.locator('#role')).toHaveText('treasurer');
  });

  test('scenario 2: banking rejects a malformed IBAN, other fields preserved', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/admin/settings/banking');
    await page.locator('#accountHolderName').fill('Club Holder');
    await page.locator('#iban').fill('NOT-AN-IBAN');
    await page.getByRole('button', { name: /save bank details/i }).click();

    await expect(
      page.getByText("That IBAN doesn't look right — double-check it."),
    ).toBeVisible();
    // The account-holder field keeps its value.
    await expect(page.locator('#accountHolderName')).toHaveValue('Club Holder');
  });

  test('scenario 3: restock rejects a non-positive quantity, in Czech', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: ADMIN_EMAIL,
    });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Kozel',
      unitPriceMinor: 4000n,
      currentStock: 10,
    });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/cs/admin/beer-types');
    await page.getByRole('button', { name: 'Naskladnit' }).click();
    await page.locator('#quantity').fill('0');
    await page.getByRole('button', { name: 'Přidat na sklad' }).click();

    await expect(page.getByText('Zadej celé číslo větší než nula.')).toBeVisible();
  });

  test('scenario 4: stock adjust needs a reason, in Czech', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: ADMIN_EMAIL,
    });
    await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Kozel',
      unitPriceMinor: 4000n,
      currentStock: 10,
    });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/cs/admin/beer-types');
    // The card's buttons are restock, adjust, edit — adjust is the first
    // "Upravit" (the adjust + edit labels collide in the Czech catalog).
    await page.getByRole('button', { name: 'Upravit' }).first().click();
    await expect(page.locator('#delta')).toBeVisible();

    await page.locator('#delta').fill('5');
    await page.getByRole('button', { name: 'Uložit změnu' }).click();

    await expect(page.getByText('Připoj krátké proč.')).toBeVisible();
  });
});
