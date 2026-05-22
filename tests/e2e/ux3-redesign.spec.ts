import { test, expect } from './fixtures/test';

// v1.4 — visual-redesign verification. A redesign cannot be
// "looks-good"-tested, but *theme applied*, *contrast*, *touch-target
// size*, *360x640 layout*, and *dark mode* all are. This spec is built
// up per user story; the v1-v1.3 suite is the behavioural regression net.

/** Parse a computed "rgb(r, g, b)" string into [r, g, b]. */
function rgb(s: string): [number, number, number] {
  const m = s.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** WCAG relative luminance of an [r,g,b] colour. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two computed colour strings. */
function contrast(a: string, b: string): number {
  const la = luminance(rgb(a));
  const lb = luminance(rgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('@ux3-redesign US1 — the Clubhouse identity', () => {
  test('scenario 1: the Clubhouse palette is applied (light)', async ({ page }) => {
    await page.goto('/en/sign-in');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Foam Cream #f6eedd — not the pre-redesign white.
    expect(rgb(bg)).toEqual([246, 238, 221]);
  });

  test('scenario 3: the display typeface is applied', async ({ page }) => {
    await page.goto('/en/sign-in');
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font.toLowerCase()).toContain('bricolage');
  });

  test('scenario 2: body text meets WCAG AA contrast (light)', async ({ page }) => {
    await page.goto('/en/sign-in');
    const { bg, fg } = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });

  test('scenario 6: the dark Clubhouse theme applies under OS dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/en/sign-in');
    const { bg, fg } = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    // Deep roast #221a11.
    expect(rgb(bg)).toEqual([34, 26, 17]);
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
});
