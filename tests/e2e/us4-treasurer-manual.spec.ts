import { and, eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import type { AuthedContext } from './fixtures/test';
import { payments } from '@/lib/db/schema/payments';

// US4 — Treasurer records a manual (cash / out-of-band) payment.
//
// Spec 014 (E2E perf) — migrated. The shared admin acts as the
// treasurer; Karel is the seeded debtor.

async function seedKarelWithBalance(
  authed: AuthedContext,
  count: number,
): Promise<{ memberId: string }> {
  const karel = await authed.seedExtraMember({ role: 'member', displayName: 'Karel Dlužník' });
  const beer = await authed.seed.beerType({ unitPriceMinor: 5000n, currentStock: 100 });
  const session = await authed.seed.drinkSession();
  for (let i = 0; i < count; i += 1) {
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: karel.memberId,
      beerTypeId: beer.id,
      createdByUserId: karel.userId,
      unitPriceMinorSnapshot: 5000n,
    });
  }
  return { memberId: karel.memberId };
}

test.describe('@us4 treasurer records a manual payment', () => {
  test('scenario 1: recording a payment lowers the member balance', async ({ page, authed }) => {
    await seedKarelWithBalance(authed, 4); // owes 200.00

    await page.goto('/admin/balances');
    await page.getByText('Karel Dlužník').click();
    await expect(page.getByText(/200[.,]00/)).toBeVisible();

    await page.locator('#amount').fill('120.00');
    await page.locator('#note').fill('cash received 2026-05-21');
    await page.getByRole('button', { name: /mark it paid/i }).click();

    // Balance falls 200.00 − 120.00 = 80.00.
    await expect(page.getByText(/80[.,]00/)).toBeVisible({ timeout: 15_000 });
  });

  test('scenario 2: the payment is confirmed + treasurer-initiated', async ({ page, authed }) => {
    const karel = await seedKarelWithBalance(authed, 2); // owes 100.00

    await page.goto(`/admin/balances/${karel.memberId}`);
    await page.locator('#amount').fill('60');
    await page.getByRole('button', { name: /mark it paid/i }).click();

    await expect
      .poll(
        async () => {
          const row = await authed.db.query.payments.findFirst({
            where: and(
              eq(payments.memberId, karel.memberId),
              eq(payments.origin, 'treasurer_initiated'),
            ),
          });
          return row
            ? `${row.status}:${row.origin}:${row.amountMinor}:${row.variableSymbol}`
            : null;
        },
        { timeout: 15_000 },
      )
      .toBe('confirmed:treasurer_initiated:6000:null');
  });
});
