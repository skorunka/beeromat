import { and, eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import type { AuthedContext } from './fixtures/test';
import { payments } from '@/lib/db/schema/payments';
import { clubBankingProfiles } from '@/lib/db/schema/clubs';

// US2 — Settle my tab via QR Platba.
//
// Spec 014 (E2E perf) — migrated. The shared admin is club_admin so
// they can configure banking AND act as the settling member (their
// balance accumulates from the seeded consumptions). The legacy spec
// signed in as a separate "member" — here the admin plays both roles.

const VALID_IBAN = 'CZ6508000000192000145399';

/** Seed the admin with `count × 50.00` of consumptions in a fresh session. */
async function seedAdminBalance(authed: AuthedContext, count: number): Promise<void> {
  const beer = await authed.seed.beerType({
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await authed.seed.drinkSession();
  for (let i = 0; i < count; i += 1) {
    await authed.seed.consumption({
      drinkSessionId: session.id,
      memberId: authed.admin.memberId,
      beerTypeId: beer.id,
      unitPriceMinorSnapshot: 5000n,
    });
  }
}

test.describe('@us2 settle via QR Platba', () => {
  test('scenario 1: admin configures the club banking profile', async ({ page, authed }) => {
    await page.goto('/admin/config');
    await page.locator('#iban').fill(VALID_IBAN);
    await page.locator('#accountHolderName').fill('Tennis Club Treasurer');
    await page.getByRole('button', { name: /save bank details/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();

    await expect
      .poll(async () => {
        const row = await authed.db.query.clubBankingProfiles.findFirst({
          where: eq(clubBankingProfiles.clubId, authed.admin.clubId),
        });
        return row?.iban ?? null;
      })
      .toBe(VALID_IBAN);
  });

  test('scenario 2: an invalid IBAN is rejected', async ({ page }) => {
    await page.goto('/admin/config');
    // Structurally plausible but fails the mod-97 checksum.
    await page.locator('#iban').fill('CZ6508000000192000145390');
    await page.getByRole('button', { name: /save bank details/i }).click();
    await expect(page.getByText(/look right/i)).toBeVisible();
  });

  test('scenario 3: a member with a balance sees a payment QR', async ({ page, authed }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });
    await seedAdminBalance(authed, 2);

    await page.goto('/settle');
    await expect(page.locator('svg').first()).toBeVisible();
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
    await expect(page.getByText(/variable symbol/i)).toBeVisible();
  });

  test('scenario 4: "I paid" creates a claimed payment', async ({ page, authed }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });
    await seedAdminBalance(authed, 2);

    await page.goto('/settle');
    await page.getByRole('button', { name: /i.ve paid/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/settle'), { timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const row = await authed.db.query.payments.findFirst({
            where: and(
              eq(payments.memberId, authed.admin.memberId),
              eq(payments.status, 'claimed'),
            ),
          });
          return row ? `${row.status}:${row.amountMinor}` : null;
        },
        { timeout: 15_000 },
      )
      .toBe('claimed:10000');
  });

  test('scenario 5: after claiming, settle shows "awaiting confirmation"', async ({
    page,
    authed,
  }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });
    await seedAdminBalance(authed, 2);

    await page.goto('/settle');
    await page.getByRole('button', { name: /i.ve paid/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/settle'), { timeout: 30_000 });

    await page.goto('/settle');
    await expect(page.getByText(/waiting on the treasurer/i)).toBeVisible();
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
  });

  test('scenario 6: a member with no balance sees the settled state', async ({ page, authed }) => {
    await authed.seed.bankingProfile({ iban: VALID_IBAN });

    await page.goto('/settle');
    await expect(page.getByText(/all square/i)).toBeVisible();
  });
});
