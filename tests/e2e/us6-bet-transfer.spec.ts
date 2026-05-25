import { and, eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import type { AuthedContext } from './fixtures/test';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';

// US6 — Bet transfer between members.
//
// Spec 014 (E2E perf) — migrated. Admin plays Alice; Bob is the
// seeded extra. Each have one drink in the open session.

async function seedAdminAndBob(
  authed: AuthedContext,
): Promise<{ bobMemberId: string }> {
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

test.describe('@us6 bet transfer', () => {
  test("scenario 1: the pick list shows only other members' drinks", async ({
    page,
    authed,
  }) => {
    await seedAdminAndBob(authed);

    await page.goto('/bet');
    await expect(page.getByText(/Pilsner Urquell · Bob/)).toBeVisible();
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(1);
  });

  test('scenario 2: transferring a drink moves the cost', async ({ page, authed }) => {
    const { bobMemberId } = await seedAdminAndBob(authed);

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    // A bet_transfers row was written: from Bob (winner) to admin (loser).
    const transfer = await authed.db.query.betTransfers.findFirst({
      where: and(
        eq(betTransfers.fromMemberId, bobMemberId),
        eq(betTransfers.toMemberId, authed.admin.memberId),
      ),
    });
    expect(transfer).toBeTruthy();

    // Admin now carries both drinks: their 50.00 + Bob's 50.00 = 100.00.
    await page.goto('/');
    await expect(page.getByText(/100[.,]00/)).toBeVisible();
  });

  test('scenario 3: a transferred drink leaves the pick list', async ({ page, authed }) => {
    await seedAdminAndBob(authed);

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    // Bob's drink can no longer be picked.
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(0);
    await expect(page.getByText(/nobody else has logged/i)).toBeVisible();
  });

  test('scenario 4: undoing a transfer restores it to the pick list', async ({
    page,
    authed,
  }) => {
    await seedAdminAndBob(authed);

    await page.goto('/bet');
    await page.getByRole('button', { name: /take it/i }).click();
    await expect(page.getByText(/you took bob/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /undo/i }).click();
    await expect(page.getByRole('button', { name: /take it/i })).toHaveCount(1);

    const voided = await authed.db
      .select()
      .from(betTransferVoids)
      .then((rows) => rows.length);
    expect(voided).toBe(1);
  });
});
