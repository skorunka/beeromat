import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';

// v1.3 US1 — a member can see their own payment history (UX review F20).
// The member's own timeline of every payment, including confirmed ones.

const EMAIL = 'ux2-payments@example.test';
const PIN = '7070';

test.describe('@ux2-payment-history member payment history', () => {
  test('scenario 1: reachable from home, shows confirmed + pending payments', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: EMAIL,
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 12_300n,
      status: 'confirmed',
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 4_500n,
      status: 'claimed',
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    // Reachable via the home greeting → account hub → payment history.
    await page.goto('/');
    await page.getByRole('link', { name: /hey/i }).click();
    await page.getByRole('link', { name: /payment history/i }).click();

    await expect(page.getByRole('heading', { name: 'Payment history' })).toBeVisible();
    await expect(page.getByText(/123/)).toBeVisible();
    await expect(page.getByText('Confirmed')).toBeVisible();
    await expect(page.getByText(/45/)).toBeVisible();
    await expect(page.getByText('Waiting on the treasurer')).toBeVisible();
  });

  test('scenario 2: a disputed payment shows the disputed state', async ({ page, seed }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: EMAIL,
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/account/payments');
    await expect(page.getByText('Flagged')).toBeVisible();
  });

  test('scenario 3: a member with no payments sees a friendly empty state', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/account/payments');
    await expect(page.getByText(/no payments yet/i)).toBeVisible();
  });

  test('scenario 4: the screen renders in Czech', async ({ page, seed }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: EMAIL,
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 9_000n,
      status: 'confirmed',
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/cs/account/payments');
    await expect(page.getByRole('heading', { name: 'Historie plateb' })).toBeVisible();
    await expect(page.getByText('Potvrzeno')).toBeVisible();
  });

  test('scenario 5: a member sees only their own payments', async ({ page, seed }) => {
    const club = await seed.club();
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: EMAIL,
    });
    const other = await seed.member({ clubId: club.id, role: 'member', displayName: 'Bob' });
    // The signed-in member's payment.
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 11_100n,
      status: 'confirmed',
    });
    // Another member's payment — must NOT appear.
    await seed.payment({
      clubId: club.id,
      memberId: other.member.id,
      createdByUserId: other.user.id,
      amountMinor: 88_800n,
      status: 'confirmed',
    });

    await signInAndUnlock(page, { email: EMAIL, pin: PIN });

    await page.goto('/account/payments');
    await expect(page.getByText(/111/)).toBeVisible();
    await expect(page.getByText(/888/)).toHaveCount(0);
  });
});
