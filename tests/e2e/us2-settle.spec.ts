import { and, eq } from 'drizzle-orm';

import { test, expect } from './fixtures/test';
import { signInAndUnlock } from './fixtures/auth';
import type { SeedContext } from './fixtures/test';
import { payments } from '@/lib/db/schema/payments';
import { clubBankingProfiles } from '@/lib/db/schema/clubs';

// US2 — Settle my tab via QR Platba.
// Backfills User Story 2 acceptance scenarios against the real app:
// admin configures banking → member with a balance settles → QR is
// shown → "I paid" creates a claimed payment → balance shows pending.

const ADMIN_EMAIL = 'us2-admin@example.test';
const ADMIN_PIN = '4242';
const MEMBER_EMAIL = 'us2-member@example.test';
const MEMBER_PIN = '1357';

const VALID_IBAN = 'CZ6508000000192000145399';

/**
 * Seed a member who owes `count × 50.00` by planting consumptions in a
 * fresh drink session. Returns the member so the spec can sign in.
 */
async function seedMemberWithBalance(
  seed: SeedContext,
  clubId: string,
  email: string,
  count: number,
) {
  const { user, member } = await seed.member({ clubId, role: 'member', email });
  const beer = await seed.beerType({
    clubId,
    createdByUserId: user.id,
    name: 'Pilsner Urquell',
    unitPriceMinor: 5000n,
    currentStock: 100,
  });
  const session = await seed.drinkSession({ clubId, openedByUserId: user.id });
  for (let i = 0; i < count; i += 1) {
    await seed.consumption({
      clubId,
      drinkSessionId: session.id,
      memberId: member.id,
      beerTypeId: beer.id,
      createdByUserId: user.id,
      unitPriceMinorSnapshot: 5000n,
    });
  }
  return { user, member };
}

test.describe('@us2 settle via QR Platba', () => {
  test('scenario 1: admin configures the club banking profile', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/admin/settings/banking');
    await page.locator('#bank-iban').fill(VALID_IBAN);
    await page.locator('#bank-holder').fill('Tennis Club Treasurer');
    await page.getByRole('button', { name: /save banking profile/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();

    await expect
      .poll(async () => {
        const row = await seed.db.query.clubBankingProfiles.findFirst({
          where: eq(clubBankingProfiles.clubId, club.id),
        });
        return row?.iban ?? null;
      })
      .toBe(VALID_IBAN);
  });

  test('scenario 2: an invalid IBAN is rejected', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'club_admin', email: ADMIN_EMAIL });

    await signInAndUnlock(page, { email: ADMIN_EMAIL, pin: ADMIN_PIN });

    await page.goto('/admin/settings/banking');
    // Structurally plausible but fails the mod-97 checksum.
    await page.locator('#bank-iban').fill('CZ6508000000192000145390');
    await page.getByRole('button', { name: /save banking profile/i }).click();
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });

  test('scenario 3: a member with a balance sees a payment QR', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/settle');
    // The SPAYD QR is rendered as an inline SVG.
    await expect(page.locator('svg').first()).toBeVisible();
    // Amount owed: 2 × 50.00 = 100.00.
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
    // A variable symbol was allocated and is shown.
    await expect(page.getByText(/variable symbol/i)).toBeVisible();
  });

  test('scenario 4: "I paid" creates a claimed payment', async ({ page, seed }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    const { member } = await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/settle');
    await page.getByRole('button', { name: /^i paid$/i }).click();
    await expect(page.getByText(/awaiting.*confirmation/i)).toBeVisible();

    // A claimed payment row now exists for the member.
    await expect
      .poll(async () => {
        const row = await seed.db.query.payments.findFirst({
          where: and(eq(payments.memberId, member.id), eq(payments.status, 'claimed')),
        });
        return row ? `${row.status}:${row.amountMinor}` : null;
      })
      .toBe('claimed:10000');
  });

  test('scenario 5: after claiming, settle shows "awaiting confirmation"', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    await seedMemberWithBalance(seed, club.id, MEMBER_EMAIL, 2);

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/settle');
    await page.getByRole('button', { name: /^i paid$/i }).click();
    await expect(page.getByText(/awaiting.*confirmation/i)).toBeVisible();

    // Re-visiting settle now shows the pending-claim state, not a new QR.
    await page.goto('/settle');
    await expect(page.getByText(/awaiting confirmation/i)).toBeVisible();
    await expect(page.getByText(/100[.,]00/).first()).toBeVisible();
  });

  test('scenario 6: a member with no balance sees the settled state', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.bankingProfile({ clubId: club.id, iban: VALID_IBAN });
    await seed.member({ clubId: club.id, role: 'member', email: MEMBER_EMAIL });

    await signInAndUnlock(page, { email: MEMBER_EMAIL, pin: MEMBER_PIN });

    await page.goto('/settle');
    await expect(page.getByText(/all settled up/i)).toBeVisible();
  });
});
