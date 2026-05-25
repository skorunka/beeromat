import { test } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { expectThumbSized, setPhoneViewport } from './fixtures/viewport';


// Spec 014 (E2E perf) opt-out: this spec drives its own sign-in flow,
// so it MUST start with no saved auth state. Remove this opt-out + the
// signInAndUnlock call(s) once migrated to the authedTest fixture.
test.use({ storageState: { cookies: [], origins: [] } });
// US2 (v1.1) — every primary action button is ≥44×44 px at 360×640.

const TREASURER_EMAIL = 'ux-touch-treasurer@example.test';
const PIN = '2323';

test.describe('@ux-touch thumb-sized controls', () => {
  test('treasurer pending action buttons meet 44px at 360×640', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'treasurer', email: TREASURER_EMAIL });
    const { user, member } = await seed.member({ clubId: club.id, role: 'member' });
    await seed.payment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
      status: 'claimed',
      amountMinor: 9000n,
    });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: PIN });
    await setPhoneViewport(page);
    await page.goto('/admin/pending');

    await expectThumbSized(page.getByRole('button', { name: /got it/i }));
    await expectThumbSized(page.getByRole('button', { name: /something.s off/i }));
  });

  test('the beer-types action buttons meet 44px at 360×640', async ({ page, seed }) => {
    const club = await seed.club();
    const { user } = await seed.member({
      clubId: club.id,
      role: 'stock_manager',
      email: TREASURER_EMAIL,
    });
    await seed.beerType({ clubId: club.id, createdByUserId: user.id, name: 'Pilsner Urquell' });

    await signInAndUnlock(page, { email: TREASURER_EMAIL, pin: PIN });
    await setPhoneViewport(page);
    await page.goto('/admin/beer-types');

    await expectThumbSized(page.getByRole('button', { name: /^restock$/i }));
    await expectThumbSized(page.getByRole('button', { name: /add a beer/i }));
  });
});
