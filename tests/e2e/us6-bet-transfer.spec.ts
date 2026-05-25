import { and, eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import type { SeedContext } from './fixtures/test';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US6 — Bet transfer between members.
// Backfills User Story 6: a member takes another member's drink onto
// their own tab; balances move; the transfer can be undone.

const ALICE_EMAIL = 'us6-alice@example.test';
const ALICE_PIN = '5151';

/**
 * Seed an open session in which Alice (the signed-in member) and Bob
 * have each logged one 50.00 drink. Returns both members.
 */
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
  return { alice, bob };
}

test.describe('@us6 bet transfer', () => {
  test('scenario 1: the pick list shows only other members’ drinks', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seedTwoDrinkers(seed, club.id);

    await signInAndUnlock(page, { email: ALICE_EMAIL, pin: ALICE_PIN });

    await page.goto('/bet');
    // Bob's drink is offered; exactly one drink is transferable (not own).
    await expect(page.getByText(/Pilsner Urquell · Bob/)).toBeVisible();
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(1);
  });

  test('scenario 2: transferring a drink moves the cost', async ({ page, seed }) => {
    const club = await seed.club();
    const { alice, bob } = await seedTwoDrinkers(seed, club.id);

    await signInAndUnlock(page, { email: ALICE_EMAIL, pin: ALICE_PIN });

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    // A bet_transfers row was written: from Bob (winner) to Alice (loser).
    const transfer = await seed.db.query.betTransfers.findFirst({
      where: and(
        eq(betTransfers.fromMemberId, bob.member.id),
        eq(betTransfers.toMemberId, alice.member.id),
      ),
    });
    expect(transfer).toBeTruthy();

    // Alice now carries both drinks: her 50.00 + Bob's 50.00 = 100.00.
    await page.goto('/');
    await expect(page.getByText(/100[.,]00/)).toBeVisible();
  });

  test('scenario 3: a transferred drink leaves the pick list', async ({ page, seed }) => {
    const club = await seed.club();
    await seedTwoDrinkers(seed, club.id);

    await signInAndUnlock(page, { email: ALICE_EMAIL, pin: ALICE_PIN });

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    // Bob's drink can no longer be picked.
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(0);
    await expect(page.getByText(/nobody else has logged/i)).toBeVisible();
  });

  test('scenario 4: undoing a transfer restores it to the pick list', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seedTwoDrinkers(seed, club.id);

    await signInAndUnlock(page, { email: ALICE_EMAIL, pin: ALICE_PIN });

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /undo/i }).click();
    // The drink is transferable again.
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(1);

    const voided = await seed.db
      .select()
      .from(betTransferVoids)
      .then((rows) => rows.length);
    expect(voided).toBe(1);
  });
});
