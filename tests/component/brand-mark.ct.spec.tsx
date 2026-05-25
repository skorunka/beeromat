import { test, expect } from '@playwright/experimental-ct-react';
import { NextIntlClientProvider } from 'next-intl';

import { BrandMark } from '@/components/ui/brand-mark';
import enMessages from '@/messages/en.json';

// Spec 015 — canonical sample for the Playwright CT branch of the
// component layer. Renders BrandMark in a real Chromium with the
// project's Tailwind CSS loaded via playwright/index.tsx, and
// wrapped in the next-intl provider so the `useTranslations` call
// inside BrandMark resolves the `common.brand` key.
//
// Proves the layer works: catalog resolution + Tailwind CSS pipeline
// + observable real DOM all land. Real visual-design-token specs
// migrate into this same dir as US3 (tasks.md T025/T026).

test.describe('BrandMark (component layer — Playwright CT, real CSS)', () => {
  test('mounts and renders the brand text + beer-mug emoji', async ({ mount }) => {
    const component = await mount(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BrandMark />
      </NextIntlClientProvider>,
    );
    await expect(component.getByText('beeromat')).toBeVisible();
    await expect(component.getByText('🍺')).toBeVisible();
  });

  test('applies CSS — the rendered text is uppercase', async ({ mount }) => {
    const component = await mount(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BrandMark />
      </NextIntlClientProvider>,
    );
    // BrandMark uses Tailwind's `uppercase` class on the outer span.
    // textTransform is a layout-level property that doesn't depend on
    // theme-variable resolution, so it reliably smoke-tests that the
    // globals.css pipeline reaches the rendered tree.
    const span = component.locator('span').first();
    const textTransform = await span.evaluate((el) => getComputedStyle(el).textTransform);
    expect(textTransform).toBe('uppercase');
  });
});
