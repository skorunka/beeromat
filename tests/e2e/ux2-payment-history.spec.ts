import { authedTest as test, expect } from './fixtures/test';

// v1.3 US1 — a member can see their own payment history (UX review F20).
//
// Spec 014 (E2E perf) — migrated. The shared admin's payment history
// is the canvas; scenario 5 (isolation) seeds Bob with a payment to
// verify admin only sees their own.

test.describe('@ux2-payment-history member payment history', () => {
  test('scenario 1: reachable from home, shows confirmed + pending payments', async ({
    page,
    authed,
  }) => {
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 12_300n,
      status: 'confirmed',
    });
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 4_500n,
      status: 'claimed',
    });

    // Reachable via the home greeting → account hub → payment history.
    await page.goto('/');
    await page.getByRole('link', { name: /hey/i }).click();
    await page.getByRole('link', { name: /payment history/i }).click();

    await expect(page.getByRole('heading', { name: 'Payment history' })).toBeVisible();
    await expect(page.getByText(/123/)).toBeVisible();
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
    await expect(page.getByText(/45/)).toBeVisible();
    await expect(page.getByText('Waiting on the treasurer', { exact: true })).toBeVisible();
  });

  test('scenario 2: a disputed payment shows the disputed state', async ({ page, authed }) => {
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    await page.goto('/account/payments');
    await expect(page.getByText('Flagged', { exact: true })).toBeVisible();
  });

  test('scenario 3: a member with no payments sees a friendly empty state', async ({ page }) => {
    await page.goto('/account/payments');
    await expect(page.getByText(/no payments yet/i)).toBeVisible();
  });

  test('scenario 4: the screen renders in Czech', async ({ page, authed }) => {
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 9_000n,
      status: 'confirmed',
    });

    await page.goto('/cs/account/payments');
    await expect(page.getByRole('heading', { name: 'Historie plateb' })).toBeVisible();
    await expect(page.getByText('Potvrzeno', { exact: true })).toBeVisible();
  });

  test('scenario 5: a member sees only their own payments', async ({ page, authed }) => {
    const bob = await authed.seedExtraMember({ role: 'member', displayName: 'Bob' });
    // The signed-in admin's payment.
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 11_100n,
      status: 'confirmed',
    });
    // Bob's payment — must NOT appear on admin's history.
    await authed.seed.payment({
      memberId: bob.memberId,
      createdByUserId: bob.userId,
      amountMinor: 88_800n,
      status: 'confirmed',
    });

    await page.goto('/account/payments');
    await expect(page.getByText(/111/)).toBeVisible();
    await expect(page.getByText(/888/)).toHaveCount(0);
  });
});
