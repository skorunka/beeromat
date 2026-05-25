import { authedTest as test, expect } from './fixtures/test';

// Spec 013 — match agreement E2E. Covers US1 (doubles for beer),
// US2 (singles via the agreement flow + legacy sunset),
// US3 (non-beer match), US4 (edit / cancel).
//
// Spec 014 (E2E perf): uses the `authedTest` fixture — the shared
// admin is pre-signed-in via the setup project, so this spec skips
// the 4-12s per-test magic-link cost. The admin (Alice) is already
// in the club; extra members (Bob, Carol, Dave) are seeded per test
// via `authed.seedExtraMember`.

async function seedThreeExtras(
  authed: import('./fixtures/test').AuthedContext,
): Promise<void> {
  await authed.seedExtraMember({ role: 'member', displayName: 'Bob' });
  await authed.seedExtraMember({ role: 'member', displayName: 'Carol' });
  await authed.seedExtraMember({ role: 'member', displayName: 'Dave' });
}

test.describe('@match-013 US1 — doubles for beer, full loop', () => {
  test('scenario 1+2: create doubles agreement → appears in Upcoming → record result', async ({
    page,
    authed,
  }) => {
    await seedThreeExtras(authed);

    await page.goto('/match');
    await expect(page.getByRole('heading', { name: 'Matches' })).toBeVisible();
    await expect(page.getByText('No matches scheduled')).toBeVisible();

    // Lineup: A1=Alice (the shared admin), A2=Bob, B1=Carol, B2=Dave.
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: authed.admin.displayName });
    await selects.nth(1).selectOption({ label: 'Bob' });
    await selects.nth(2).selectOption({ label: 'Carol' });
    await selects.nth(3).selectOption({ label: 'Dave' });

    // Pick straight pairing (EXPLICIT — required per FR-006 / Q4).
    await page.getByRole('button', { name: /Straight/ }).click();
    await page.getByRole('button', { name: 'Create match' }).click();

    // Land on the agreement detail page.
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]+$/);
    await expect(page.getByText(new RegExp(`${authed.admin.displayName} \\+ Bob`))).toBeVisible();
    await expect(page.getByText(/Carol \+ Dave/)).toBeVisible();
    await expect(page.getByText('🍺 For beer')).toBeVisible();

    // Record: side B won.
    await page.getByRole('button', { name: /Carol \+ Dave won/ }).click();

    // Settled toast + Undo affordance.
    await expect(page.getByText(/Settled/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('scenario 3: undo within 5 min returns agreement to OPEN', async ({ page, authed }) => {
    await seedThreeExtras(authed);

    await page.goto('/match');
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: authed.admin.displayName });
    await selects.nth(1).selectOption({ label: 'Bob' });
    await selects.nth(2).selectOption({ label: 'Carol' });
    await selects.nth(3).selectOption({ label: 'Dave' });
    await page.getByRole('button', { name: /Straight/ }).click();
    await page.getByRole('button', { name: 'Create match' }).click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]+$/);

    // Record + undo.
    await page
      .getByRole('button', { name: new RegExp(`${authed.admin.displayName} \\+ Bob won`) })
      .click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Result reversed.')).toBeVisible();

    // Back on /match the agreement is in Upcoming again.
    await page.goto('/match');
    await expect(page.getByText(new RegExp(`${authed.admin.displayName} \\+ Bob`))).toBeVisible();
  });
});

test.describe('@match-013 US2 — singles via agreement + legacy sunset', () => {
  test('singles agreement: format toggle collapses to 2 seats, hides pairing', async ({
    page,
    authed,
  }) => {
    await seedThreeExtras(authed);
    await page.goto('/match');
    await page.getByRole('button', { name: 'Singles' }).click();

    // Lineup section has 2 selects (one per side seat 1).
    await expect(page.locator('select')).toHaveCount(2);
    // Pairing radio not visible in singles.
    await expect(page.getByRole('button', { name: 'Straight' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Crossed' })).not.toBeVisible();
  });

  test('legacy 012 one-step quick-log UI is gone', async ({ page, authed }) => {
    await seedThreeExtras(authed);
    await page.goto('/match');
    await expect(page.getByRole('button', { name: 'I won' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I lost' })).toHaveCount(0);
  });
});

test.describe('@match-013 US3 — non-beer match', () => {
  test('Friendly agreement records result with zero transfers', async ({ page, authed }) => {
    await seedThreeExtras(authed);

    await page.goto('/match');
    await page.getByRole('button', { name: 'Singles' }).click();
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: authed.admin.displayName });
    await selects.nth(1).selectOption({ label: 'Bob' });
    // Flip For beer? to Friendly.
    await page.getByRole('button', { name: 'Friendly' }).click();
    await page.getByRole('button', { name: 'Create match' }).click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]+$/);

    // Friendly chip visible on detail page.
    await expect(page.getByText(/^Friendly$/).first()).toBeVisible();

    // Record + verify no beer transfer.
    await page
      .getByRole('button', { name: new RegExp(`${authed.admin.displayName} won`) })
      .click();
    await expect(page.getByText(/0 beer\(s\) transferred/)).toBeVisible();
  });
});

test.describe('@match-013 US4 — edit + cancel', () => {
  test('cancel open agreement removes it from Upcoming', async ({ page, authed }) => {
    await seedThreeExtras(authed);

    await page.goto('/match');
    await page.getByRole('button', { name: 'Singles' }).click();
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: authed.admin.displayName });
    await selects.nth(1).selectOption({ label: 'Bob' });
    await page.getByRole('button', { name: 'Create match' }).click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]+$/);

    // Open the Edit/Cancel <details> and cancel.
    await page.getByText('Edit or cancel match').click();
    page.on('dialog', (dlg) => dlg.accept());
    await page.getByRole('button', { name: 'Cancel match' }).click();

    // Bounced back to /match; the agreement is no longer in Upcoming.
    await expect(page).toHaveURL(/\/match$/);
    await expect(
      page.getByText(new RegExp(`${authed.admin.displayName} vs Bob`)),
    ).toHaveCount(0);
  });

  test('edit form vanishes once the result is recorded (FR-013)', async ({ page, authed }) => {
    await seedThreeExtras(authed);

    await page.goto('/match');
    await page.getByRole('button', { name: 'Singles' }).click();
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: authed.admin.displayName });
    await selects.nth(1).selectOption({ label: 'Bob' });
    await page.getByRole('button', { name: 'Create match' }).click();

    // Record the result.
    await page
      .getByRole('button', { name: new RegExp(`${authed.admin.displayName} won`) })
      .click();
    await expect(
      page.getByText(new RegExp(`(Settled|All square|${authed.admin.displayName} won)`)),
    ).toBeVisible();

    // Edit affordance no longer present.
    await expect(page.getByText('Edit or cancel match')).toHaveCount(0);
  });
});
