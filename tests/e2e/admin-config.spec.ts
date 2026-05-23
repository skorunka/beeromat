import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';

// Spec 008 — end-to-end coverage of self-bootstrap + admin-config
// editing. Walks quickstart Scenarios A, B, and C.
//
// Scenario A (US1): fresh DB → first sign-in becomes club_admin.
// Scenario B (US2): admin edits config (name + currency change
//                   confirmation flow).
// Scenario C: RBAC — non-admin redirected away from /admin/config.

const PIN = '4271';

test.describe('@admin-config spec 008', () => {
  test('US1 — self-bootstrap: first sign-in to a fresh DB becomes club_admin', async ({
    page,
    seed,
  }) => {
    // Fresh state: a single seeded club, NO users, NO members. The
    // test fixture's truncate already wiped everything; seed only the
    // club.
    const club = await seed.club({ name: 'Bootstrap Club' });

    // Drive the real sign-in form with a brand-new email. The
    // bootstrap branch in requestMagicLinkAction pre-creates the user
    // (since users count = 0), the magic-link round-trip completes,
    // and the session.create.after hook in better-auth.ts promotes
    // the user to club_admin on the seeded club.
    await signInAndUnlock(page, { email: 'bootstrap-admin@example.test', pin: PIN });

    // Assert the members row was created with club_admin role on the
    // seeded club.
    const memberRow = await seed.db.query.members.findFirst({
      where: eq(members.email, 'bootstrap-admin@example.test'),
    });
    expect(memberRow).toBeTruthy();
    expect(memberRow?.role).toBe('club_admin');
    expect(memberRow?.clubId).toBe(club.id);
  });

  test('US2 — admin edits club name and sees it persist', async ({ page, seed }) => {
    const club = await seed.club({ name: 'Old Name' });
    const { user } = await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: 'admin@example.test',
      displayName: 'Test Admin',
    });
    expect(user.id).toBeTruthy();

    await signInAndUnlock(page, { email: 'admin@example.test', pin: PIN });

    await page.goto('/admin/config');
    const nameInput = page.getByLabel(/Club name/i);
    await expect(nameInput).toHaveValue('Old Name');

    await nameInput.fill('Brand New Name');
    await page.getByRole('button', { name: /Save config/i }).click();

    // Assert DB write happened.
    await expect
      .poll(async () => {
        const row = await seed.db.query.clubs.findFirst({ where: eq(clubs.id, club.id) });
        return row?.name ?? null;
      })
      .toBe('Brand New Name');

    // Reload the page — the form should now show the new value.
    await page.reload();
    await expect(page.getByLabel(/Club name/i)).toHaveValue('Brand New Name');
  });

  test('US2 — currency change shows confirmation dialog before saving', async ({ page, seed }) => {
    const club = await seed.club({ name: 'Currency Club', currencyCode: 'CZK' });
    await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: 'currency-admin@example.test',
      displayName: 'Currency Admin',
    });

    await signInAndUnlock(page, { email: 'currency-admin@example.test', pin: PIN });

    await page.goto('/admin/config');

    // Change currency CZK → EUR.
    const currencyInput = page.getByLabel(/Currency/i);
    await currencyInput.fill('EUR');
    await page.getByRole('button', { name: /Save config/i }).click();

    // FR-008 — the confirmation dialog must appear before any DB write.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Heads-up — currency change/i)).toBeVisible();

    // Confirm.
    await page.getByRole('button', { name: /Yep, change it/i }).click();

    // Now the DB write happens.
    await expect
      .poll(async () => {
        const row = await seed.db.query.clubs.findFirst({ where: eq(clubs.id, club.id) });
        return row?.currencyCode ?? null;
      })
      .toBe('EUR');
  });

  test('RBAC — a non-admin member cannot reach /admin/config', async ({ page, seed }) => {
    const club = await seed.club({ name: 'RBAC Club' });
    await seed.member({
      clubId: club.id,
      role: 'member',
      email: 'just-a-member@example.test',
      displayName: 'Just a Member',
    });

    await signInAndUnlock(page, { email: 'just-a-member@example.test', pin: PIN });

    await page.goto('/admin/config');
    // requireRole redirects non-admins; we land somewhere OTHER than
    // /admin/config. The exact redirect target is policy in
    // lib/auth/session.ts — assert by URL, not target.
    await expect(page).not.toHaveURL(/\/admin\/config$/);
  });
});
