import { authedTest as test, expect } from './fixtures/test';
import type { AuthedContext } from './fixtures/test';

// v1.3 US6 — money-input guidance + bet-transfer visibility
// (UX review F17 remainder, F12).
//
// Spec 014 (E2E perf) — migrated to authedTest. The shared admin
// (club_admin role) covers the treasurer scenario. The bet-tally
// scenario uses the admin as "Alice" and seeds Bob as an extra.

/** Seed an open session in which the admin and Bob have each logged a drink. */
async function seedAdminAndBob(authed: AuthedContext): Promise<{ bobMemberId: string }> {
  const bob = await authed.seedExtraMember({ role: 'member', displayName: 'Bob' });
  const beer = await authed.seed.beerType({
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await authed.seed.drinkSession();
  await authed.seed.consumption({
    drinkSessionId: session.id,
    memberId: authed.admin.memberId,
    beerTypeId: beer.id,
    unitPriceMinorSnapshot: 5000n,
  });
  await authed.seed.consumption({
    drinkSessionId: session.id,
    memberId: bob.memberId,
    beerTypeId: beer.id,
    createdByUserId: bob.userId,
    unitPriceMinorSnapshot: 5000n,
  });
  return { bobMemberId: bob.memberId };
}

test.describe('@ux2-polish money guidance & bet tally', () => {
  test('scenario 1: a money-amount input shows format helper text', async ({ page, authed }) => {
    const karel = await authed.seedExtraMember({ role: 'member', displayName: 'Karel' });

    await page.goto(`/admin/balances/${karel.memberId}`);
    await expect(page.getByText(/comma or a dot/i)).toBeVisible();
  });

  test('scenario 2: the bet screen shows a running transfer tally', async ({ page, authed }) => {
    await seedAdminAndBob(authed);

    await page.goto('/bet');
    // No transfers yet → no tally clutter.
    await expect(page.getByText(/from bets this round/i)).toHaveCount(0);

    // Admin takes Bob's drink.
    await page.getByRole('button', { name: /take it/i }).click();

    // The running tally now appears.
    await expect(page.getByText(/from bets this round/i)).toBeVisible({ timeout: 15_000 });
  });
});
