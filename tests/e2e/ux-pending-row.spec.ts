import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { expectSeparated, setPhoneViewport } from './fixtures/viewport';

// US3 (v1.1) — the treasurer pending row is legible and mis-tap-safe.

const TREASURER_EMAIL = 'ux-pending-treasurer@example.test';
const PIN = '3434';

test.describe('@ux-pending-row treasurer pending row', () => {
  test('amount + name are legible and Confirm / Dispute are separated', async ({
    page,
    seed,
  }) => {
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
      status: 'claimed',
      amountMinor: 12_000n,
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: PIN });
    await setPhoneViewport(page);
    await page.goto('/admin/pending');

    // Member name and amount are both legible on a 360px-wide row.
    await expect(page.getByText('Pavel Dlužník')).toBeVisible();
    await expect(page.getByText(/120[.,]00/)).toBeVisible();

    // Confirm and Dispute do not sit mis-tap-close to each other.
    await expectSeparated(
      page.getByRole('button', { name: /confirm received/i }),
      page.getByRole('button', { name: /^dispute$/i }),
    );
  });
});
