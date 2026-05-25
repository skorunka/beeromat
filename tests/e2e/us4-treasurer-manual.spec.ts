import { and, eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import type { SeedContext } from './fixtures/test';
import { payments } from '@/lib/db/schema/payments';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US4 — Treasurer records a manual (cash / out-of-band) payment.
// Backfills User Story 4: a treasurer-recorded payment is confirmed
// immediately and a member's balance drops by the recorded amount.

const TREASURER_EMAIL = 'us4-treasurer@example.test';
const TREASURER_PIN = '3690';

/** Seed a member who owes `count × 50.00` via planted consumptions. */
async function seedMemberWithBalance(seed: SeedContext, clubId: string, count: number) {
  const { user, member } = await seed.member({
    clubId,
    role: 'member',
    displayName: 'Karel Dlužník',
  });
  const beer = await seed.beerType({
    clubId,
    createdByUserId: user.id,
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
  return member;
}

test.describe('@us4 treasurer records a manual payment', () => {
  test('scenario 1: recording a payment lowers the member balance', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    await seedMemberWithBalance(seed, club.id, 4); // owes 200.00

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    // Reach the detail page through the balances overview.
    await page.goto('/admin/balances');
    await page.getByText('Karel Dlužník').click();
    await expect(page.getByText(/200[.,]00/)).toBeVisible();

    await page.locator('#amount').fill('120.00');
    await page.locator('#note').fill('cash received 2026-05-21');
    await page.getByRole('button', { name: /mark it paid/i }).click();

    // Balance falls 200.00 − 120.00 = 80.00.
    await expect(page.getByText(/80[.,]00/)).toBeVisible({ timeout: 15_000 });
  });

  test('scenario 2: the payment is confirmed + treasurer-initiated', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const member = await seedMemberWithBalance(seed, club.id, 2); // owes 100.00

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto(`/admin/balances/${member.id}`);
    await page.locator('#amount').fill('60');
    await page.getByRole('button', { name: /mark it paid/i }).click();

    await expect
      .poll(
        async () => {
          const row = await seed.db.query.payments.findFirst({
            where: and(
              eq(payments.memberId, member.id),
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
