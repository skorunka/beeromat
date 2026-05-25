import { authedTest as test, expect } from './fixtures/test';

// US6 (v1.1) — the bet screen guides instead of dead-ending when no
// drink session is open.
//
// Spec 014 (E2E perf) — migrated to authedTest: the shared admin is
// signed in; `truncateDomainOnly` ensures no drink session is open
// (sessions are a domain table, wiped between tests).

test.describe('@ux-bet-no-session bet screen with no open session', () => {
  test('it explains how to start a session and links to the log screen', async ({ page }) => {
    await page.goto('/bet');

    // Guidance is shown, not a bare dead end.
    await expect(
      page.getByText(/a round kicks off when someone logs the first beer/i),
    ).toBeVisible();

    // The "log a beer to start" link goes to the log screen.
    await page.getByRole('link', { name: /log a beer to kick/i }).click();
    await expect(page.getByRole('heading', { name: 'Log a beer' })).toBeVisible();
  });
});
