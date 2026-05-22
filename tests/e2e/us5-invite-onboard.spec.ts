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
    await page.locator('#email').fill('fresh-invitee@example.test');
    await page.getByRole('button', { name: /send invite/i }).click();

    // The invitation row is created regardless of email delivery
    // (Resend is faked in E2E, so the UI may report a send failure —
    // but inviteMemberAction persists the invitation before the send).
    await expect
      .poll(
        async () => {
          const row = await seed.db.query.invitations.findFirst({
            where: eq(invitations.email, 'fresh-invitee@example.test'),
          });
          return row?.status ?? null;
        },
        // The invite Server Action over the Neon proxy can outrun the 5s
        // poll default under full-suite load.
        { timeout: 15_000 },
      )
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
    await expect(page.getByLabel(/your name/i)).toBeVisible();

    // Scenario 3: submitting creates the member + shows the
    // check-inbox confirmation.
    await page.getByLabel(/your name/i).fill('Nový Člen');
    await page.getByRole('button', { name: /join the club/i }).click();
    // Generous timeout: acceptInvitationAction over the Neon proxy can
    // outrun the 5s assertion default under full-suite load.
    await expect(page.getByText(/you'?re in/i)).toBeVisible({ timeout: 15_000 });

    // A member row now exists for the invitee, in the right club.
    await expect
      .poll(
        async () => {
          const row = await seed.db.query.members.findFirst({
            where: eq(members.email, 'newbie@example.test'),
          });
          return row ? `${row.clubId}:${row.role}` : null;
        },
        { timeout: 15_000 },
      )
      .toBe(`${club.id}:member`);
  });

  test('scenario 4: an invalid invitation token is rejected', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await page.goto('/invitation/this-token-does-not-exist');
    await page.getByLabel(/your name/i).fill('Nobody');
    await page.getByRole('button', { name: /join the club/i }).click();

    await expect(page.getByText(/no longer good/i)).toBeVisible();
  });
});
