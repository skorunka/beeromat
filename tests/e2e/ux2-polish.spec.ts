import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import type { SeedContext } from './fixtures/test';

// v1.3 US6 — money-input guidance + bet-transfer visibility
// (UX review F17 remainder, F12).

const TREASURER_EMAIL = 'ux2-polish-treasurer@example.test';
const TREASURER_PIN = '1717';
const ALICE_EMAIL = 'ux2-polish-alice@example.test';
const ALICE_PIN = '2727';

/** Seed an open session in which Alice and Bob have each logged a drink. */
async function seedTwoDrinkers(seed: SeedContext, clubId: string) {
  const alice = await seed.member({
    clubId,
    role: 'member',
    email: ALICE_EMAIL,
    displayName: 'Alice',
  });
  const bob = await seed.member({ clubId, role: 'member', displayName: 'Bob' });
  const beer = await seed.beerType({
    clubId,
    createdByUserId: alice.user.id,
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await seed.drinkSession({ clubId, openedByUserId: alice.user.id });
  await seed.consumption({
    clubId,
    drinkSessionId: session.id,
    memberId: alice.member.id,
    beerTypeId: beer.id,
    createdByUserId: alice.user.id,
    unitPriceMinorSnapshot: 5000n,
  });
  await seed.consumption({
    clubId,
    drinkSessionId: session.id,
    memberId: bob.member.id,
    beerTypeId: beer.id,
    createdByUserId: bob.user.id,
    unitPriceMinorSnapshot: 5000n,
  });
}

test.describe('@ux2-polish money guidance & bet tally', () => {
  test('scenario 1: a money-amount input shows format helper text', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { member } = await seed.member({ clubId: club.id, role: 'member', displayName: 'Karel' });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto(`/admin/balances/${member.id}`);
    await expect(page.getByText(/comma or a dot/i)).toBeVisible();
  });

  test('scenario 2: the bet screen shows a running transfer tally', async ({ page, seed }) => {
    const club = await seed.club();
    await seedTwoDrinkers(seed, club.id);

    await signInAndUnlock(page, { email: ALICE_EMAIL, pin: ALICE_PIN });

    await page.goto('/bet');
    // No transfers yet → no tally clutter.
    await expect(page.getByText(/from bets this round/i)).toHaveCount(0);

    // Alice takes Bob's drink.
    await page.getByRole('button', { name: /take it/i }).click();

    // The running tally now appears.
    await expect(page.getByText(/from bets this round/i)).toBeVisible({ timeout: 15_000 });
  });
});
