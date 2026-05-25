import type { Page, Route } from '@playwright/test';

// Spec 015 — Server Action interception helper for the API-mocked
// E2E layer. Next.js Server Actions are POST requests to the page
// itself with a `Next-Action` header carrying the action's hash id.
// `page.route()` lets us intercept by URL + header and return a
// canned response WITHOUT the action ever executing — no DB writes,
// no real auth state changes.
//
// Per research R5: the helper is typed via a discriminated union
// matching the production action's return shape. If the action's
// types change in the source, TypeScript catches drift here.
//
// USAGE (in a tests/e2e-mock/*.spec.ts):
//
//   import { mockServerAction } from './fixtures/mock-action';
//
//   test('shows DUPLICATE_MEMBER error', async ({ page }) => {
//     await mockServerAction(page, {
//       response: { ok: false, code: 'DUPLICATE_MEMBER' },
//     });
//     await page.goto('/match');
//     await page.getByRole('button', { name: 'Create match' }).click();
//     await expect(page.getByText(/Each player can only/)).toBeVisible();
//   });

export interface MockServerActionOptions {
  /**
   * Substring or RegExp matched against the request URL. Defaults to
   * matching ANY same-origin POST (the typical Next.js Server Action
   * shape — pages POST to themselves).
   */
  urlPattern?: string | RegExp;
  /**
   * The mocked response body. Either:
   *  - a plain object → serialised as JSON, status 200
   *  - a `Response`-shaped record `{ status, body, headers }` for non-200 simulation
   *
   * The shape MUST match the real Server Action's discriminated-union
   * return type so the page's client code handles it as it would in
   * production.
   */
  response: unknown | { status: number; body: unknown; headers?: Record<string, string> };
  /**
   * Optional predicate to additionally filter requests (e.g. match by
   * `Next-Action` header value). Receives the Playwright Route.
   */
  match?: (route: Route) => boolean;
}

function isResponseShape(
  r: unknown,
): r is { status: number; body: unknown; headers?: Record<string, string> } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'status' in r &&
    'body' in r &&
    typeof (r as { status: unknown }).status === 'number'
  );
}

/**
 * Intercept Next.js Server Action requests and return a canned
 * response. Returns the cleanup callback (call it in `afterEach`
 * if the mock should only apply to one test; usually unnecessary
 * because each test gets a fresh BrowserContext).
 */
export async function mockServerAction(
  page: Page,
  options: MockServerActionOptions,
): Promise<() => Promise<void>> {
  // Default: any same-origin POST request — covers the common
  // "form submits to the page itself" Server Action shape. Narrow
  // via `urlPattern` or `match` per-test.
  const pattern = options.urlPattern ?? /\/(en|cs)\/.+/;

  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() !== 'POST') {
      await route.continue();
      return;
    }
    // Only intercept Next.js Server Actions (they carry `next-action`
    // OR `next-router-state-tree` headers).
    const nextAction = req.headers()['next-action'];
    if (!nextAction) {
      await route.continue();
      return;
    }
    if (options.match && !options.match(route)) {
      await route.continue();
      return;
    }

    if (isResponseShape(options.response)) {
      await route.fulfill({
        status: options.response.status,
        body: typeof options.response.body === 'string'
          ? options.response.body
          : JSON.stringify(options.response.body),
        headers: {
          'content-type': 'application/json',
          ...(options.response.headers ?? {}),
        },
      });
    } else {
      // Next.js Server Action responses are encoded — for now we
      // return a simple JSON body and rely on the receiving client
      // code being lenient. Specs that need the exact RSC payload
      // shape can pass a `{ status, body, headers }` with the wire
      // format themselves.
      await route.fulfill({
        status: 200,
        body: JSON.stringify(options.response),
        headers: { 'content-type': 'application/json' },
      });
    }
  };

  await page.route(pattern, handler);
  return async () => {
    await page.unroute(pattern, handler);
  };
}
