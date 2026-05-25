import { authedTest as test, expect } from './fixtures/test';
import { expectSeparated, setPhoneViewport } from './fixtures/viewport';

// US3 (v1.1) — the treasurer pending row is legible and mis-tap-safe.
//
// Spec 014 (E2E perf) — migrated to authedTest: the shared admin is
// club_admin (≥ treasurer per the role hierarchy) so they see the
// /admin/pending screen. We seed Pavel as an extra member and a
// claimed payment on his behalf via authed.seed.payment.

test.describe('@ux-pending-row treasurer pending row', () => {
  test('amount + name are legible and Confirm / Dispute are separated', async ({
    page,
    authed,
  }) => {
    const pavel = await authed.seedExtraMember({
      role: 'member',
      displayName: 'Pavel Dlužník',
    });
    await authed.seed.payment({
      memberId: pavel.memberId,
      createdByUserId: pavel.userId,
      status: 'claimed',
      amountMinor: 12_000n,
    });

    await setPhoneViewport(page);
    await page.goto('/admin/pending');

    // Member name and amount are both legible on a 360px-wide row.
    await expect(page.getByText('Pavel Dlužník')).toBeVisible();
    await expect(page.getByText(/120[.,]00/)).toBeVisible();

    // Confirm and Dispute do not sit mis-tap-close to each other.
    await expectSeparated(
      page.getByRole('button', { name: /got it/i }),
      page.getByRole('button', { name: /something.s off/i }),
    );
  });
});
