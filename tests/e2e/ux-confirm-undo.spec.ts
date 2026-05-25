import { and, eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { payments } from '@/lib/db/schema/payments';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US4 (v1.1) — a treasurer can undo a mistaken confirmation.

const TREASURER_EMAIL = 'ux-undo-treasurer@example.test';
const PIN = '4545';

test.describe('@ux-confirm-undo undo a confirmation', () => {
  test('scenario 1: confirm then undo reverses the payment', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
    const payment = await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      status: 'claimed',
      amountMinor: 8_000n,
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: PIN });

    await page.goto('/admin/pending');
    await page.getByRole('button', { name: /got it/i }).click();

    // The confirmed payment now shows in the "Recently confirmed" list.
    await expect(page.getByText(/just confirmed/i)).toBeVisible({ timeout: 15_000 });

    // Undo it, supplying a reason.
    await page.getByRole('button', { name: /undo/i }).first().click();
    await page
      .getByPlaceholder(/wrong one/i)
      .fill('Confirmed the wrong claim by mistake');
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: /undo/i })
      .click();

    // The payment leaves the confirmed state (voided).
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
      .toBe('voided');
  });

  test('scenario 2: undo is not offered when nothing is confirmed', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      status: 'claimed',
      amountMinor: 5_000n,
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: PIN });
    await page.goto('/admin/pending');

    // A claimed-only payment: the pending claim shows, but no
    // "Recently confirmed" section and no undo control.
    await expect(page.getByRole('button', { name: /got it/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);

    // Sanity: nothing is confirmed in the DB.
    const confirmed = await seed.db.query.payments.findMany({
      where: and(eq(payments.clubId, club.id), eq(payments.status, 'confirmed')),
    });
    expect(confirmed).toHaveLength(0);
  });
});
