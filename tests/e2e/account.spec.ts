import { eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import { users } from '@/lib/db/schema/auth';
import { members } from '@/lib/db/schema/members';

const PIN = '4271';

// Spec 010 — /account display-name edit E2E coverage.

test.describe('@account spec 010 — /account display-name edit', () => {
  test('member edits own display name; home greeting + DB lock-step', async ({ page, seed }) => {
    const club = await seed.club({ name: 'Account Test Club' });
    await seed.member({
      clubId: club.id,
      role: 'member',
      email: 'standa@example.test',
      displayName: 'Original Name',
    });

    await signInAndUnlock(page, { email: 'standa@example.test', pin: PIN });

    await page.goto('/account');
    const nameInput = page.locator('#displayName');
    await expect(nameInput).toHaveValue('Original Name');

    await nameInput.fill('Standa Novák');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Both DB rows committed (lock-step per FR-006).
    await expect
      .poll(async () => {
        const u = await seed.db.query.users.findFirst({
          where: eq(users.email, 'standa@example.test'),
        });
        const m = await seed.db.query.members.findFirst({
          where: eq(members.email, 'standa@example.test'),
        });
        return { user: u?.name ?? null, member: m?.displayName ?? null };
      })
      .toEqual({ user: 'Standa Novák', member: 'Standa Novák' });

    // Home greeting reflects the new name on next navigation.
    await page.goto('/');
    await expect(page.getByText(/Standa Novák/)).toBeVisible();
  });

  test('validation: empty name rejected inline, no DB write', async ({ page, seed }) => {
    const club = await seed.club({ name: 'Validation Club' });
    await seed.member({
      clubId: club.id,
      role: 'member',
      email: 'val@example.test',
      displayName: 'Initial',
    });

    await signInAndUnlock(page, { email: 'val@example.test', pin: PIN });

    await page.goto('/account');
    await page.locator('#displayName').fill('');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Inline error visible; DB unchanged.
    await expect(page.getByText(/Enter your name|Doplň své jméno/)).toBeVisible();
    const u = await seed.db.query.users.findFirst({ where: eq(users.email, 'val@example.test') });
    expect(u?.name).toBe('Initial');
  });

  test('stub rows render: email + PIN + sign-out-all are visible but non-functional', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({
      clubId: club.id,
      role: 'member',
      email: 'stubs@example.test',
      displayName: 'Stubs',
    });

    await signInAndUnlock(page, { email: 'stubs@example.test', pin: PIN });

    await page.goto('/account');

    // Email row shows the member's actual email.
    await expect(page.getByText('stubs@example.test')).toBeVisible();

    // PIN + sign-out-all rows show "later" / "coming soon" badges.
    const laterBadges = page.getByText(/^later$/);
    await expect(laterBadges.first()).toBeVisible();
    await expect(page.getByText(/^coming soon$/)).toBeVisible();

    // The sign-out-all CTA is disabled.
    const signOutAll = page.getByRole('button', { name: /Sign out everywhere|Odhlásit všude/ });
    await expect(signOutAll).toBeDisabled();
  });
});
