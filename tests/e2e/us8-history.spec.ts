import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { betTransfers } from '@/lib/db/schema/bets';

// US8 — Cross-session history.
// Backfills User Story 8: a member browses past sessions and drills
// into one to see line items, with bet transfers correctly attributed.

const MEMBER_EMAIL = 'us8-member@example.test';
const MEMBER_PIN = '8080';

test.describe('@us8 cross-session history', () => {
  test('scenario 1: the history list shows past sessions', async ({ page, seed }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: MEMBER_EMAIL,
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
    });
    for (const title of ['Spring match', 'Summer match']) {
      const session = await seed.drinkSession({
        clubId: club.id,
        openedByUserId: user.id,
        title,
        startedAt: new Date(),
        endedAt: new Date(),
      });
      await seed.consumption({
        clubId: club.id,
        drinkSessionId: session.id,
        memberId: member.id,
        beerTypeId: beer.id,
        createdByUserId: user.id,
        unitPriceMinorSnapshot: 5000n,
      });
    }

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/history');
    await expect(page.getByText('Spring match')).toBeVisible();
    await expect(page.getByText('Summer match')).toBeVisible();
  });

  test('scenario 2: drilling into a session shows its line items', async ({ page, seed }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: MEMBER_EMAIL,
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Kozel',
    });
    const session = await seed.drinkSession({
      clubId: club.id,
      openedByUserId: user.id,
      title: 'Cup final',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: member.id,
      beerTypeId: beer.id,
      createdByUserId: user.id,
      unitPriceMinorSnapshot: 5000n,
    });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/history');
    await page.getByText('Cup final').click();
    await expect(page.getByText('Kozel')).toBeVisible();
    await expect(page.getByText(/50[.,]00/).first()).toBeVisible();
  });

  test('scenario 3: a session detail attributes a bet transfer', async ({ page, seed }) => {
    const club = await seed.club();
    const alice = await seed.member({ clubId: club.id, role: 'member', email: MEMBER_EMAIL });
    const bob = await seed.member({ clubId: club.id, role: 'member', displayName: 'Bob' });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: alice.user.id,
      name: 'Radegast',
    });
    const session = await seed.drinkSession({
      clubId: club.id,
      openedByUserId: alice.user.id,
      title: 'Derby night',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    // Alice's own drink (so the session appears in her history).
    await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: alice.member.id,
      beerTypeId: beer.id,
      createdByUserId: alice.user.id,
      unitPriceMinorSnapshot: 5000n,
    });
    // Bob's drink, which Alice takes on a lost bet.
    const bobDrink = await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: bob.member.id,
      beerTypeId: beer.id,
      createdByUserId: bob.user.id,
      unitPriceMinorSnapshot: 5000n,
    });
    await seed.db.insert(betTransfers).values({
      clubId: club.id,
      sourceConsumptionId: bobDrink.id,
      fromMemberId: bob.member.id,
      toMemberId: alice.member.id,
      createdByUserId: alice.user.id,
    });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/history');
    await page.getByText('Derby night').click();

    // The transfer is shown, attributed to Alice taking Bob's drink.
    await expect(page.getByText(/you took bob/i)).toBeVisible();
    // Effective total: her own 50.00 + Bob's transferred 50.00 = 100.00.
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
  });
});
