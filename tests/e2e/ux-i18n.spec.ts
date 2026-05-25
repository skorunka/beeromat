import { authedTest as test, expect } from './fixtures/test';

// US1 (v1.1) — the UI renders fully in Czech and in English.
// The suite runs in English by default (see the page fixture); these
// specs visit explicit /en and /cs paths to check both catalogs.
//
// Spec 014 (E2E perf) — migrated to authedTest.

test.describe('@ux-i18n bilingual UI', () => {
  test('scenario 1: screens render in English', async ({ page }) => {
    await page.goto('/en/log');
    await expect(page.getByRole('heading', { name: 'Log a beer' })).toBeVisible();

    await page.goto('/en/admin/pending');
    await expect(page.getByRole('heading', { name: 'To confirm' })).toBeVisible();
  });

  test('scenario 2: screens render in Czech', async ({ page }) => {
    await page.goto('/cs/log');
    await expect(page.getByRole('heading', { name: 'Zapsat pivo' })).toBeVisible();

    await page.goto('/cs/admin/pending');
    await expect(page.getByRole('heading', { name: 'K potvrzení' })).toBeVisible();
    // No raw catalog keys leak onto the page.
    await expect(page.locator('body')).not.toContainText('treasurer.');
  });
});
