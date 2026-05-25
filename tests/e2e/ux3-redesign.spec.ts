import { authedTest as test, expect } from './fixtures/test';

// v1.4 — visual-redesign verification. A redesign cannot be
// "looks-good"-tested, but *theme applied*, *contrast*, *touch-target
// size*, *360x640 layout*, and *dark mode* all are. This spec is built
// up per user story; the v1-v1.3 suite is the behavioural regression net.
//
// Spec 014 (E2E perf) — migrated. The signed-out scenarios (US1, US2,
// US4) navigate to /sign-in directly; Playwright loads them with the
// admin storageState but the unauthenticated /sign-in page renders
// regardless. US3/US5 use the shared admin (admin's screens still
// render the member layouts since the visual layer is role-agnostic).

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
    expect(rgb(bg)).toEqual([34, 26, 17]);
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('@ux3-redesign US2 — the component system', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('scenario: the primary action meets the 44px touch target', async ({ page }) => {
    await page.goto('/en/sign-in');

    const input = page.locator('input[data-slot="input"]').first();
    await expect(input).toBeVisible();
    const inputBox = await input.boundingBox();
    expect(inputBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const buttons = page.locator('button[data-slot="button"]');
    let primaryButtons = 0;
    for (let i = 0; i < (await buttons.count()); i++) {
      const b = buttons.nth(i);
      const bg = await b.evaluate((el) => getComputedStyle(el).backgroundColor);
      if (bg === 'rgb(138, 82, 20)') {
        const box = await b.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        primaryButtons++;
      }
    }
    expect(primaryButtons).toBeGreaterThan(0);
  });

  test('scenario: primary buttons share one computed style — the Honey Amber token', async ({
    page,
  }) => {
    await page.goto('/en/sign-in');
    const primaryToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    );
    expect(primaryToken).toBe('#8a5214');
    const bgs = await page
      .locator('button[data-slot="button"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(bgs.some((b) => b === 'rgb(138, 82, 20)')).toBe(true);
  });

  test('scenario: a focused control shows a visible focus ring', async ({ page }) => {
    await page.goto('/en/sign-in');
    const input = page.locator('input[data-slot="input"]').first();
    await input.focus();
    const shadow = await input.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');
  });
});

test.describe('@ux3-redesign US3 — member screen layouts', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('scenario: member screens fit a 360px viewport — no horizontal scroll', async ({
    page,
    authed,
  }) => {
    await authed.seed.beerType({
      name: 'Pilsner Urquell',
      unitPriceMinor: 5000n,
      currentStock: 50,
    });

    for (const path of ['/', '/log', '/tab', '/bet', '/history', '/account']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} must not scroll horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('scenario: the home balance is the prominent focal point', async ({ page }) => {
    await page.goto('/');
    const amount = page.getByText(/0[.,]00/).first();
    await expect(amount).toBeVisible();
    const fontSize = await amount.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(40);
  });

  test('scenario: the bottom nav does not occlude page content', async ({ page }) => {
    await page.goto('/');
    const { wrapperPadBottom, navHeight } = await page.evaluate(() => {
      const nav = document.querySelector('nav')!;
      const wrapper = nav.previousElementSibling as HTMLElement;
      return {
        navHeight: nav.getBoundingClientRect().height,
        wrapperPadBottom: parseFloat(getComputedStyle(wrapper).paddingBottom),
      };
    });
    expect(wrapperPadBottom).toBeGreaterThanOrEqual(navHeight - 8);
  });
});

test.describe('@ux3-redesign US4 — the welcome hero', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('scenario: a signed-out visit shows the branded welcome hero', async ({ page }) => {
    await page.goto('/en/sign-in');
    await expect(page.getByText('beeromat').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /after the match/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /link/i })).toBeVisible();
  });

  test('scenario: the welcome hero fits a 360px viewport', async ({ page }) => {
    await page.goto('/en/sign-in');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('@ux3-redesign US5 — admin screens', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('scenario: an admin screen uses the Clubhouse surface', async ({ page }) => {
    await page.goto('/admin');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(rgb(bg)).toEqual([246, 238, 221]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
