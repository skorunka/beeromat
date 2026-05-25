import { and, eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import { payments } from '@/lib/db/schema/payments';

// US4 (v1.1) — a treasurer can undo a mistaken confirmation.
//
// Spec 014 (E2E perf) — migrated. The shared admin (club_admin ≥
// treasurer) confirms a member's payment then undoes it.

test.describe('@ux-confirm-undo undo a confirmation', () => {
  test('scenario 1: confirm then undo reverses the payment', async ({ page, authed }) => {
    const member = await authed.seedExtraMember({ role: 'member', displayName: 'Member' });
    const payment = await authed.seed.payment({
      memberId: member.memberId,
      createdByUserId: member.userId,
      status: 'claimed',
      amountMinor: 8_000n,
    });

    await page.goto('/admin/pending');
    await page.getByRole('button', { name: /got it/i }).click();

    // The confirmed payment now shows in the "Recently confirmed" list.
    await expect(page.getByText(/just confirmed/i)).toBeVisible({ timeout: 15_000 });

    // Undo it, supplying a reason.
    await page.getByRole('button', { name: /undo/i }).first().click();
    await page.getByPlaceholder(/wrong one/i).fill('Confirmed the wrong claim by mistake');
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: /undo/i })
      .click();

    // The payment leaves the confirmed state (voided).
    await expect
      .poll(
        async () => {
          const row = await authed.db.query.payments.findFirst({
            where: eq(payments.id, payment.id),
          });
          return row?.status ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe('voided');
  });

  test('scenario 2: undo is not offered when nothing is confirmed', async ({ page, authed }) => {
    const member = await authed.seedExtraMember({ role: 'member', displayName: 'Member' });
    await authed.seed.payment({
      memberId: member.memberId,
      createdByUserId: member.userId,
      status: 'claimed',
      amountMinor: 5_000n,
    });

    await page.goto('/admin/pending');

    // A claimed-only payment: the pending claim shows, but no
    // "Recently confirmed" section and no undo control.
    await expect(page.getByRole('button', { name: /got it/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);

    // Sanity: nothing is confirmed in the DB.
    const confirmed = await authed.db.query.payments.findMany({
      where: and(eq(payments.clubId, authed.admin.clubId), eq(payments.status, 'confirmed')),
    });
    expect(confirmed).toHaveLength(0);
  });
});
