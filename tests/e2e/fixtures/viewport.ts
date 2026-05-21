import { expect, type Locator, type Page } from '@playwright/test';

// Shared viewport + touch-target helpers for the v1.1 UX specs.
// 360×640 is the cheap-Android baseline the constitution's one-thumb
// mandate targets.

export const PHONE_VIEWPORT = { width: 360, height: 640 };

/** Switch the page to the 360×640 phone baseline. */
export async function setPhoneViewport(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
}

/**
 * Assert every control matched by `locator` renders a hit target of at
 * least 44×44 CSS px (constitution Principle I — one-thumb operation).
 */
export async function expectThumbSized(locator: Locator): Promise<void> {
  // Wait for the controls to render before measuring — count() alone
  // does not auto-retry and can race a server-component navigation.
  await locator.first().waitFor({ state: 'visible', timeout: 15_000 });
  const count = await locator.count();
  expect(count, 'expected at least one control to measure').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const box = await locator.nth(i).boundingBox();
    expect(box, `control #${i} has no bounding box`).not.toBeNull();
    expect(box!.height, `control #${i} height >= 44px`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `control #${i} width >= 44px`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Assert two controls do not overlap and have a clear horizontal or
 * vertical gap between them (mis-tap resistance — US3).
 */
export async function expectSeparated(a: Locator, b: Locator, minGapPx = 8): Promise<void> {
  const boxA = await a.boundingBox();
  const boxB = await b.boundingBox();
  expect(boxA, 'first control has no bounding box').not.toBeNull();
  expect(boxB, 'second control has no bounding box').not.toBeNull();
  const horizontalGap = Math.max(
    boxB!.x - (boxA!.x + boxA!.width),
    boxA!.x - (boxB!.x + boxB!.width),
  );
  const verticalGap = Math.max(
    boxB!.y - (boxA!.y + boxA!.height),
    boxA!.y - (boxB!.y + boxB!.height),
  );
  expect(
    Math.max(horizontalGap, verticalGap),
    'controls must be clearly separated',
  ).toBeGreaterThanOrEqual(minGapPx);
}
