import { and, eq } from 'drizzle-orm';

import { authedTest as test, expect } from './fixtures/test';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';

// US3 — Treasurer confirms received payments.
//
// Spec 014 (E2E perf) — migrated. The shared admin (club_admin ≥
// treasurer) acts as the treasurer for scenarios 1-4. Scenario 5
// seeds a dispute against the admin themselves — they see the banner
// on protected pages.

test.describe('@us3 treasurer confirms payments', () => {
  test('scenario 1: the treasurer sees a pending claim', async ({ page, authed }) => {
    const pavel = await authed.seedExtraMember({
      role: 'member',
      displayName: 'Pavel Dlužník',
    });
    await authed.seed.payment({
      memberId: pavel.memberId,
      createdByUserId: pavel.userId,
      amountMinor: 10_000n,
      status: 'claimed',
    });

    await page.goto('/admin/pending');
    await expect(page.getByText('Pavel Dlužník')).toBeVisible();
    await expect(page.getByText(/100[.,]00/)).toBeVisible();
  });

  test('scenario 2 (SC-007a): one tap confirms a claimed payment', async ({ page, authed }) => {
    const member = await authed.seedExtraMember({ role: 'member', displayName: 'Member' });
    const payment = await authed.seed.payment({
      memberId: member.memberId,
      createdByUserId: member.userId,
      amountMinor: 8_000n,
      status: 'claimed',
    });

    await page.goto('/admin/pending');
    // SC-007a: exactly one tap — no confirmation dialog, no form.
    await page.getByRole('button', { name: /got it/i }).click();

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
      .toBe('confirmed');
  });

  test('scenario 3: bulk-confirm selected claims', async ({ page, authed }) => {
    for (let i = 0; i < 3; i += 1) {
      const m = await authed.seedExtraMember({ role: 'member', displayName: `Member ${i + 1}` });
      await authed.seed.payment({
        memberId: m.memberId,
        createdByUserId: m.userId,
        amountMinor: 5_000n,
        status: 'claimed',
      });
    }

    await page.goto('/admin/pending');
    const checkboxes = page.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) await checkboxes.nth(i).check();

    await page.getByRole('button', { name: /confirm 3/i }).click();

    await expect
      .poll(
        async () => {
          const rows = await authed.db.query.payments.findMany({
            where: and(
              eq(payments.clubId, authed.admin.clubId),
              eq(payments.status, 'confirmed'),
            ),
          });
          return rows.length;
        },
        { timeout: 15_000 },
      )
      .toBe(3);
  });

  test('scenario 4: disputing a claim records the reason', async ({ page, authed }) => {
    const member = await authed.seedExtraMember({ role: 'member', displayName: 'Member' });
    const payment = await authed.seed.payment({
      memberId: member.memberId,
      createdByUserId: member.userId,
      amountMinor: 7_000n,
      status: 'claimed',
    });

    await page.goto('/admin/pending');
    await page.getByRole('button', { name: /something.s off/i }).click();
    await page
      .getByPlaceholder(/nothing matching/i)
      .fill('No matching transfer on the bank statement');
    await page.getByRole('button', { name: /flag it/i }).click();

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
      .toBe('disputed');

    const transition = await authed.db.query.paymentStateTransitions.findFirst({
      where: and(
        eq(paymentStateTransitions.paymentId, payment.id),
        eq(paymentStateTransitions.toStatus, 'disputed'),
      ),
    });
    expect(transition?.reason).toBe('No matching transfer on the bank statement');
  });

  test('scenario 5: a member sees the dispute banner', async ({ page, authed }) => {
    // Seed a disputed payment against the admin themselves — the
    // banner renders in the (app) layout on every protected page for
    // whoever's payment got flagged.
    await authed.seed.payment({
      memberId: authed.admin.memberId,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    await page.goto('/');
    await expect(page.getByText(/got flagged/i)).toBeVisible();
    await expect(page.getByText(/Amount does not match the transfer/i)).toBeVisible();
  });
});
