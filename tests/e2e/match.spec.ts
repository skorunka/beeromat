import { and, eq, isNull } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { matches } from '@/lib/db/schema/matches';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';

const PIN = '4271';

test.describe('@match spec 012 — match log + loser-pays-beer', () => {
  test('I lost: matches row created, bet_transfer fires from winner→loser when winner has session beer', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user: winnerUser, member: winner } = await seed.member({
      clubId: club.id,
      email: 'winner@example.test',
      displayName: 'Winner',
    });
    await seed.member({
      clubId: club.id,
      email: 'loser@example.test',
      displayName: 'Loser',
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: winnerUser.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
    });
    const session = await seed.drinkSession({
      clubId: club.id,
      openedByUserId: winnerUser.id,
    });
    await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.id,
      beerTypeId: beer.id,
      createdByUserId: winnerUser.id,
      unitPriceMinorSnapshot: 5000n,
    });

    await signInAndUnlock(page, { email: 'loser@example.test', pin: PIN });
    await page.goto('/match');

    await page.locator('#opponentMemberId').selectOption({ label: 'Winner' });
    await page.getByRole('button', { name: /I lost/i }).click();

    await expect
      .poll(async () => (await seed.db.select().from(matches)).length, { timeout: 10_000 })
      .toBe(1);
    const transfer = await seed.db.query.betTransfers.findFirst();
    expect(transfer?.fromMemberId).toBe(winner.id);
  });

  test('I won: matches row created with caller as winner', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, email: 'me@example.test', displayName: 'Me' });
    await seed.member({ clubId: club.id, email: 'opp@example.test', displayName: 'Opp' });

    await signInAndUnlock(page, { email: 'me@example.test', pin: PIN });
    await page.goto('/match');

    await page.locator('#opponentMemberId').selectOption({ label: 'Opp' });
    await page.getByRole('button', { name: /I won/i }).click();

    await expect
      .poll(async () => {
        const m = await seed.db.query.matches.findFirst();
        if (!m) return null;
        return { winner: m.winnerMemberId, loser: m.loserMemberId };
      }, { timeout: 10_000 })
      .not.toBeNull();
  });

  test('undo within 5-min voids match + linked transfers', async ({ page, seed }) => {
    const club = await seed.club();
    const { user: winnerUser, member: winner } = await seed.member({
      clubId: club.id,
      email: 'winner2@example.test',
      displayName: 'Winner2',
    });
    await seed.member({
      clubId: club.id,
      email: 'loser2@example.test',
      displayName: 'Loser2',
    });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: winnerUser.id,
      unitPriceMinor: 5000n,
    });
    const session = await seed.drinkSession({
      clubId: club.id,
      openedByUserId: winnerUser.id,
    });
    await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.id,
      beerTypeId: beer.id,
      createdByUserId: winnerUser.id,
      unitPriceMinorSnapshot: 5000n,
    });

    await signInAndUnlock(page, { email: 'loser2@example.test', pin: PIN });
    await page.goto('/match');
    await page.locator('#opponentMemberId').selectOption({ label: 'Winner2' });
    await page.getByRole('button', { name: /I lost/i }).click();

    // Wait for the matches row + transfer to commit, undo button visible.
    await expect
      .poll(async () => (await seed.db.select().from(matches)).length, { timeout: 10_000 })
      .toBe(1);

    await page.getByRole('button', { name: /Undo|Vrátit/ }).click();

    await expect
      .poll(
        async () =>
          (
            await seed.db
              .select()
              .from(matches)
              .where(and(isNull(matches.voidedAt), eq(matches.clubId, club.id)))
          ).length,
        { timeout: 10_000 },
      )
      .toBe(0);
    const voids = await seed.db.select().from(betTransferVoids);
    const transfersAll = await seed.db.select().from(betTransfers);
    expect(voids.length).toBe(transfersAll.length);
  });

  test('Match nav tab visible on the bottom nav', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, email: 'nav@example.test' });

    await signInAndUnlock(page, { email: 'nav@example.test', pin: PIN });
    await page.goto('/');

    // Look for the Match link scoped to the nav region — the standalone
    // /match href is the unambiguous selector.
    await expect(page.locator('nav a[href$="/match"]')).toBeVisible();
  });
});
