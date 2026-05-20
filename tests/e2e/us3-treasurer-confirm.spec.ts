import { and, eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { payments, paymentStateTransitions } from '@/lib/db/schema/payments';

// US3 — Treasurer confirms received payments.
// Backfills User Story 3's acceptance scenarios + SC-007a (a single
// claimed payment is confirmed in exactly one tap).

const TREASURER_EMAIL = 'us3-treasurer@example.test';
const TREASURER_PIN = '2468';
const MEMBER_PIN = '1111';

test.describe('@us3 treasurer confirms payments', () => {
  test('scenario 1: the treasurer sees a pending claim', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      displayName: 'Pavel Dlužník',
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 10_000n,
      status: 'claimed',
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto('/admin/pending');
    await expect(page.getByText('Pavel Dlužník')).toBeVisible();
    await expect(page.getByText(/100[.,]00/)).toBeVisible();
  });

  test('scenario 2 (SC-007a): one tap confirms a claimed payment', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
    const payment = await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 8_000n,
      status: 'claimed',
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto('/admin/pending');
    // SC-007a: exactly one tap — no confirmation dialog, no form.
    await page.getByRole('button', { name: /confirm received/i }).click();

    await expect
      .poll(
        async () => {
          const row = await seed.db.query.payments.findFirst({
            where: eq(payments.id, payment.id),
          });
          return row?.status ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe('confirmed');
  });

  test('scenario 3: bulk-confirm selected claims', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    for (let i = 0; i < 3; i += 1) {
      const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
      await seed.payment({
        clubId: club.id,
        memberId: member.id,
        createdByUserId: user.id,
        amountMinor: 5_000n,
        status: 'claimed',
      });
    }

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto('/admin/pending');
    const checkboxes = page.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) await checkboxes.nth(i).check();

    await page.getByRole('button', { name: /confirm 3 selected/i }).click();

    await expect
      .poll(
        async () => {
          const rows = await seed.db.query.payments.findMany({
            where: and(eq(payments.clubId, club.id), eq(payments.status, 'confirmed')),
          });
          return rows.length;
        },
        { timeout: 15_000 },
      )
      .toBe(3);
  });

  test('scenario 4: disputing a claim records the reason', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
    const payment = await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 7_000n,
      status: 'claimed',
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: TREASURER_PIN });

    await page.goto('/admin/pending');
    await page.getByRole('button', { name: /dispute/i }).click();
    await page
      .getByPlaceholder(/no matching transfer/i)
      .fill('No matching transfer on the bank statement');
    await page.getByRole('button', { name: /dispute payment/i }).click();

    await expect
      .poll(
        async () => {
          const row = await seed.db.query.payments.findFirst({
            where: eq(payments.id, payment.id),
          });
          return row?.status ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe('disputed');

    const transition = await seed.db.query.paymentStateTransitions.findFirst({
      where: and(
        eq(paymentStateTransitions.paymentId, payment.id),
        eq(paymentStateTransitions.toStatus, 'disputed'),
      ),
    });
    expect(transition?.reason).toBe('No matching transfer on the bank statement');
  });

  test('scenario 5: a member sees the dispute banner', async ({ page, seed }) => {
    const club = await seed.club();
    const memberEmail = 'us3-disputed-member@example.test';
    const { user, member } = await seed.member({
      clubId: club.id,
      role: 'member',
      email: memberEmail,
    });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      amountMinor: 6_000n,
      status: 'disputed',
      reason: 'Amount does not match the transfer',
    });

    await signInAndUnlock(page, { email: memberEmail, pin: MEMBER_PIN });

    // The banner renders in the (app) layout on every protected page.
    await expect(page.getByText(/was disputed/i)).toBeVisible();
    await expect(page.getByText(/Amount does not match the transfer/i)).toBeVisible();
  });
});
