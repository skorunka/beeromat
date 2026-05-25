import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import type { SeedContext } from './fixtures/test';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// v1.2 US2 — trustworthy money forms.
// The settle "paid another way" form and the treasurer manual-payment form
// validate amounts and notes in-app, in the active locale, with no native
// validation bubble. Acceptance scenarios from spec.md US2.

const TREASURER_EMAIL = 'forms-us2-treasurer@example.test';
const TREASURER_PIN = '2468';
const MEMBER_EMAIL = 'forms-us2-member@example.test';
const MEMBER_PIN = '1379';
const VALID_IBAN = 'CZ6508000000192000145399';

/** Seed a member who owes `count × 50.00` via planted consumptions. */
async function seedMemberWithBalance(
  seed: SeedContext,
  clubId: string,
  email: string,
  count: number,
) {
  const { user, member } = await seed.member({ clubId, role: 'member', email });
  const beer = await seed.beerType({
    clubId,
    createdByUserId: user.id,
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await seed.drinkSession({ clubId, openedByUserId: user.id });
  for (let i = 0; i < count; i += 1) {
    await seed.consumption({
      clubId,
      drinkSessionId: session.id,
      memberId: member.id,
      beerTypeId: beer.id,
      createdByUserId: user.id,
      unitPriceMinorSnapshot: 5000n,
    });
  }
  return { user, member };
}

test.describe('@forms-money money form validation', () => {
  test('scenario 1: manual payment rejects a non-numeric amount, in Czech', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { member } = await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto(`/cs/admin/balances/${member.id}`);
    await page.locator('#amount').fill('abc');
    await page.getByRole('button', { name: 'Označit jako zaplaceno' }).click();

    // In-app Czech message; the form does not submit.
    await expect(page.getByText('Zadej platnou částku.')).toBeVisible();
    await expect(page.locator('form')).toHaveAttribute('novalidate', '');
  });

  test('scenario 2: settle "paid another way" needs a note, in Czech', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/cs/settle');
    await page.getByRole('button', { name: 'Zaplaceno jinak? (hotově, převodem)' }).click();
    // The amount is prefilled with the balance; the note starts empty.
    await page.getByRole('button', { name: 'Označit jako zaplaceno' }).click();

    await expect(
      page.getByText('Připoj krátkou poznámku (třeba „hotově pokladníkovi“).'),
    ).toBeVisible();
  });

  test('scenario 3: settle "paid another way" rejects a zero amount', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/settle');
    await page
      .getByRole('button', { name: 'Paid another way? (cash, direct transfer)' })
      .click();
    await page.locator('#amount').fill('0');
    await page.locator('#note').fill('cash to the treasurer');
    await page.getByRole('button', { name: 'Mark it paid' }).click();

    await expect(page.getByText('Pop in a real amount.')).toBeVisible();
  });

  test('scenario 4: a valid manual payment records', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { member } = await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto(`/admin/balances/${member.id}`);
    await page.locator('#amount').fill('60');
    await page.getByRole('button', { name: 'Mark it paid' }).click();

    // On success the form resets — the amount field clears.
    await expect(page.locator('#amount')).toHaveValue('', { timeout: 15_000 });
  });
});
