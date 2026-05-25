import { authedTest as test, expect } from './fixtures/test';

// v1.3 US5 — clearer empty states and guidance (UX review F16, F19).
//
// Spec 014 (E2E perf) — migrated. The disputed-payment scenario seeds
// a dispute against the shared admin (banner renders on protected
// pages for the person whose payment got flagged).

test.describe('@ux2-guidance empty states & guidance', () => {
  test('scenario 1: the log screen shows a friendly empty state', async ({ page }) => {
    // truncateDomainOnly already wiped any leftover beer_types from a
    // prior test, so the grid is empty.
    await page.goto('/log');
    await expect(page.getByText(/no beers in the fridge yet/i)).toBeVisible();
  });

  test('scenario 2: the dispute banner offers an actionable next step', async ({
    page,
    authed,
  }) => {
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    // The dispute banner renders on protected pages.
    await page.goto('/');
    const banner = page.getByText(/got flagged/i);
    await expect(banner).toBeVisible();
    // It offers a link to act on it, not just an explanation.
    await expect(page.getByRole('link', { name: /sort it out/i })).toBeVisible();
  });
});
