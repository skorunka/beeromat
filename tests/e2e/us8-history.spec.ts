import { authedTest as test, expect } from './fixtures/test';
import { betTransfers } from '@/lib/db/schema/bets';

// US8 — Cross-session history.
//
// Spec 014 (E2E perf) — migrated. The shared admin browses their
// own past sessions; scenario 3 uses admin as Alice + a seeded Bob.

test.describe('@us8 cross-session history', () => {
  test('scenario 1: the history list shows past sessions', async ({ page, authed }) => {
    const beer = await authed.seed.beerType({ name: 'Pilsner Urquell' });
    for (const title of ['Spring match', 'Summer match']) {
      const session = await authed.seed.drinkSession({
        title,
        startedAt: new Date(),
        endedAt: new Date(),
      });
      await authed.seed.consumption({
        drinkSessionId: session.id,
        memberId: authed.admin.memberId,
        beerTypeId: beer.id,
        unitPriceMinorSnapshot: 5000n,
      });
    }

    await page.goto('/history');
    await expect(page.getByText('Spring match')).toBeVisible();
    await expect(page.getByText('Summer match')).toBeVisible();
  });

  test('scenario 2: drilling into a session shows its line items', async ({ page, authed }) => {
    const beer = await authed.seed.beerType({ name: 'Kozel' });
    const session = await authed.seed.drinkSession({
      title: 'Cup final',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: authed.admin.memberId,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
    });

    await page.goto('/history');
    await page.getByText('Cup final').click();
    await expect(page.getByText('Kozel')).toBeVisible();
    await expect(page.getByText(/50[.,]00/).first()).toBeVisible();
  });

  test('scenario 3: a session detail attributes a bet transfer', async ({ page, authed }) => {
    const bob = await authed.seedExtraMember({ role: 'member', displayName: 'Bob' });
    const beer = await authed.seed.beerType({ name: 'Radegast' });
    const session = await authed.seed.drinkSession({
      title: 'Derby night',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    // Admin's own drink (so the session appears in their history).
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: authed.admin.memberId,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
    });
    // Bob's drink, which admin takes on a lost bet.
    const bobDrink = await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: bob.memberId,
      beerTypeId: beer.id,
      createdByUserId: bob.userId,
      unitPriceMinorSnapshot: 5000n,
    });
    await authed.db.insert(betTransfers).values({
      clubId: authed.admin.clubId,
      sourceConsumptionId: bobDrink.id,
      fromMemberId: bob.memberId,
      toMemberId: authed.admin.memberId,
      createdByUserId: authed.admin.userId,
    });

    await page.goto('/history');
    await page.getByText('Derby night').click();

    // The transfer is shown, attributed to admin taking Bob's drink.
    await expect(page.getByText(/you took bob/i)).toBeVisible();
    // Effective total: admin's own 50.00 + Bob's transferred 50.00 = 100.00.
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
  });
});
