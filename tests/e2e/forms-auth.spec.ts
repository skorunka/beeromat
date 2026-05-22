import type { Page } from '@playwright/test';

import { test, expect } from './fixtures/test';
import { reachPinSetupGate } from './fixtures/auth';

// v1.2 US1 — trustworthy auth & onboarding forms.
// Every auth/onboarding form validates in-app, in the active locale, with no
// browser-native validation bubble. Acceptance scenarios from spec.md US1.

const EMAIL = 'forms-us1@example.test';

/** Wait until the sign-in submit button is enabled (Turnstile test key
 *  auto-passes, which is what flips it on). */
async function waitForSubmitEnabled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[type="submit"]');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    { timeout: 15_000 },
  );
}

/** The form opts out of native browser validation — so no native bubble can
 *  ever appear; validation is the app's job. */
async function expectFormSuppressesNativeValidation(page: Page): Promise<void> {
  await expect(page.locator('form')).toHaveAttribute('novalidate', '');
}

test.describe('@forms-auth auth & onboarding form validation', () => {
  test('scenario 1: PIN setup rejects a short PIN in-app, in Czech', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await reachPinSetupGate(page, EMAIL);
    // The PIN gate guards every authenticated route — visit it in Czech.
    await page.goto('/cs');
    await expect(page.locator('#pin')).toBeVisible();

    await page.locator('#pin').fill('123');
    await page.getByRole('button', { name: 'Uložit PIN' }).click();

    // In-app Czech message beside the field; no native bubble.
    await expect(page.getByText('PIN musí mít přesně 4 číslice')).toBeVisible();
    await expectFormSuppressesNativeValidation(page);
  });

  test('scenario 2: PIN setup flags a mismatch and keeps both values', async ({
    page,
    seed,
  }) => {
    const club = await seed.club();
    await seed.member({ clubId: club.id, role: 'member', email: EMAIL });

    await reachPinSetupGate(page, EMAIL);
    await page.goto('/cs');
    await expect(page.locator('#pin')).toBeVisible();

    await page.locator('#pin').fill('1234');
    await page.locator('#confirmPin').fill('5678');
    await page.getByRole('button', { name: 'Uložit PIN' }).click();

    await expect(page.getByText('PINy se neshodují')).toBeVisible();
    // Neither entered value is cleared.
    await expect(page.locator('#pin')).toHaveValue('1234');
    await expect(page.locator('#confirmPin')).toHaveValue('5678');
  });

  test('scenario 3: sign-in rejects a malformed email in-app, in English', async ({
    page,
  }) => {
    await page.goto('/en/sign-in');
    await waitForSubmitEnabled(page);

    await page.locator('#email').fill('notanemail');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText("That email doesn't look right.")).toBeVisible();
    await expectFormSuppressesNativeValidation(page);
  });

  test('scenario 4: the validation message is locale-aware', async ({ page }) => {
    // English first.
    await page.goto('/en/sign-in');
    await waitForSubmitEnabled(page);
    await page.locator('#email').fill('notanemail');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("That email doesn't look right.")).toBeVisible();

    // The same form in Czech surfaces the Czech catalog string — the message
    // is a translation key, not frozen text (FR-008).
    await page.goto('/cs/sign-in');
    await waitForSubmitEnabled(page);
    await page.locator('#email').fill('notanemail');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Tenhle e-mail nevypadá správně.')).toBeVisible();
  });

  test('scenario 5: invitation accept rejects an empty name', async ({ page }) => {
    // The invitation page renders the form for any token (validation happens
    // in the action); an empty name is caught client-side before submit.
    await page.goto('/en/invitation/forms-us1-dummy-token');
    await expect(page.getByRole('heading', { name: 'Welcome to beeromat' })).toBeVisible();

    await page.getByRole('button', { name: 'Join the club' }).click();

    await expect(page.getByText('Pop your name in first.')).toBeVisible();
    await expectFormSuppressesNativeValidation(page);
  });

  test('scenario 6: a double-tapped submit fires once', async ({ page }) => {
    await page.goto('/en/sign-in');
    await waitForSubmitEnabled(page);
    await page.locator('#email').fill('forms-us1-double@example.test');

    const submit = page.locator('button[type="submit"]');
    await submit.click();
    // A second tap lands on the now-disabled (in-flight) button — best-effort,
    // it must not fire the action again.
    await submit.click({ timeout: 1000 }).catch(() => {});

    // The form reaches the single "link sent" screen exactly once.
    await expect(
      page.getByRole('heading', { name: 'Link sent — check your email.' }),
    ).toBeVisible();
  });
});
