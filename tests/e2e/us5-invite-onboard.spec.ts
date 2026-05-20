import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { invitations, members } from '@/lib/db/schema/members';

// US5 — Invite and onboard a new member.
// Backfills User Story 5 acceptance scenarios against the real app.

const ADMIN_EMAIL = 'us5-admin@example.test';
const ADMIN_PIN = '9090';

test.describe('@us5 invite + onboard', () => {
  test('scenario 1: an admin issues an invitation', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/admin/members');
    await page.locator('#invite-email').fill('fresh-invitee@example.test');
    await page.getByRole('button', { name: /send invitation/i }).click();

    // The invitation row is created regardless of email delivery
    // (Resend is faked in E2E, so the UI may report a send failure —
    // but inviteMemberAction persists the invitation before the send).
    await expect
      .poll(async () => {
        const row = await seed.db.query.invitations.findFirst({
          where: eq(invitations.email, 'fresh-invitee@example.test'),
        });
        return row?.status ?? null;
      })
      .toBe('pending');
  });

  test('scenario 2+3: an invitee accepts and a member is created', async ({ page, seed }) => {
    const club = await seed.club();
    const { user: admin } = await seed.member({
      clubId: club.id,
      role: 'club_admin',
      email: ADMIN_EMAIL,
    });
    const { rawToken } = await seed.invitation({
      clubId: club.id,
      createdByUserId: admin.id,
      email: 'newbie@example.test',
      role: 'member',
      rawToken: 'us5-known-token',
    });

    // Scenario 2: the invitation link shows the welcome form.
    await page.goto(`/invitation/${rawToken}`);
    await expect(page.getByLabel(/display name/i)).toBeVisible();

    // Scenario 3: submitting creates the member + shows the
    // check-inbox confirmation.
    await page.getByLabel(/display name/i).fill('Nový Člen');
    await page.getByRole('button', { name: /accept invitation/i }).click();
    await expect(page.getByText(/you'?re in/i)).toBeVisible();

    // A member row now exists for the invitee, in the right club.
    await expect
      .poll(async () => {
        const row = await seed.db.query.members.findFirst({
          where: eq(members.email, 'newbie@example.test'),
        });
        return row ? `${row.clubId}:${row.role}` : null;
      })
      .toBe(`${club.id}:member`);
  });

  test('scenario 4: an invalid invitation token is rejected', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await page.goto('/invitation/this-token-does-not-exist');
    await page.getByLabel(/display name/i).fill('Nobody');
    await page.getByRole('button', { name: /accept invitation/i }).click();

    await expect(page.getByText(/no longer valid|invalid/i)).toBeVisible();
  });
});
