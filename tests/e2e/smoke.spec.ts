import { expect, test } from '@playwright/test';

// Smoke test — the first link in the E2E chain (per constitution v1.2.0
// "verify each link in isolation"). Asserts only:
//   1. Playwright can spawn the production-mode app on the test port
//   2. A request to /cs/sign-in returns a successful HTML response
//   3. The page renders the sign-in form heading
//
// No DB, no email, no Turnstile, no auth flow. Those gates come in
// subsequent E2E setup commits.

test('@smoke sign-in page renders on the test server', async ({ page }) => {
  const response = await page.goto('/cs/sign-in');
  expect(response, 'response object').not.toBeNull();
  expect(response!.status(), 'http status').toBe(200);

  // Czech sign-in heading from messages/cs.json -> auth.signIn.title
  await expect(page.getByRole('heading', { name: 'Přihlásit se' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
});

test('@smoke english sign-in page renders', async ({ page }) => {
  const response = await page.goto('/en/sign-in');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
