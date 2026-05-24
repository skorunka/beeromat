# Phase 0 Research — Fresh-Install Onboarding Wizard (v1.9)

Spec 009's technical context was largely concrete (single-club Next.js 16 app, existing Better Auth + Drizzle + next-intl stack, spec 008's promotion path reused unchanged). The handful of genuine unknowns are recorded below — each as a Decision / Rationale / Alternatives row so a future reader knows *why* this shape was chosen, not just *what* was chosen.

---

## 1. Where does the fresh-state check live in Next.js 16?

**Decision**: In `proxy.ts` (Next.js 16's renamed middleware), composed AROUND the existing `next-intl/middleware` call. The proxy fires first: if `isFreshDeployment()` is true and the request path is not already `/setup`, redirect to `/<resolved-locale>/setup`. If false and the path IS `/setup`, redirect to `/<resolved-locale>/sign-in` (anonymous) or `/<resolved-locale>/` (signed in). Otherwise hand off to `intlMiddleware(request)` as today.

**Rationale**: Three properties matter for the route guard. (1) **No render flicker**: a layout-level check would render the wrong tree once and then redirect on the client — visible flash on slow mobile. The proxy redirects before SSR. (2) **Cheap on the post-bootstrap path**: 99.9% of requests over a deployment's lifetime are post-bootstrap; the cached `false` signal means proxy adds ~zero ms in that mode (see §2). (3) **Compositional**: the existing proxy already extends next-intl with the `NEXT_LOCALE` cookie redirect; adding a third concern (state-based redirect) keeps all routing decisions in one file the reader can scan top-to-bottom.

**Alternatives considered**:
- **Root layout (`app/[locale]/layout.tsx`)** — rejected. Would require the layout to be a server component that early-returns a `<redirect />` based on state; would still render the layout chrome briefly (logo + theme styles) before the redirect lands. Worse mobile FCP, worse UX.
- **Per-route guard in every `page.tsx`** — rejected. N route files × per-feature; high drift risk, missing-coverage bugs, redundant DB calls.
- **`instrumentation.ts` register hook** — rejected. Instrumentation runs once at server start, not per request; can't drive a redirect.

---

## 2. How is the fresh-state signal cached so the proxy stays cheap?

**Decision**: Module-level boolean (`let isFreshCached: boolean | null = null;`) inside `lib/db/queries/bootstrap-state.ts`, with a **sticky-false** invalidation rule: once `isFreshCached` becomes `false`, return `false` immediately without re-querying; while `isFreshCached` is `null` or `true`, run the two `COUNT(*)` queries on every call and update the cache. After the bootstrap action successfully commits, the action sets `isFreshCached = false` directly (cheap, in-process); a separate fresh process picks up the false value naturally on its first DB read.

**Rationale**: The state transition in v1.9 is **strictly one-way**. Once a `clubs` row is inserted, that row stays forever (no admin UI deletes it; manual psql deletion is an unrecoverable foot-gun the spec explicitly does not handle). Same for `users` — Better Auth's sign-up cleanup never empties the table once a user has signed in even once. So `isFresh` can only ever transition `true → false`; the inverse is impossible in normal operation. That property makes the sticky-false cache trivially correct without an LRU, TTL, or pub/sub invalidation.

Cold-start cost: a brand-new process serves its first request with one DB roundtrip (~30 ms against Neon Cloud cold-start, single-digit ms against the local proxy). Every subsequent request in that process pays zero DB cost. Multi-process deployments (Vercel autoscaled lambdas) each pay their own one-time cost — acceptable given the deployment has at most a handful of cold-starts per day at this scale.

**Alternatives considered**:
- **No cache, COUNT every request** — rejected. ~30 ms × every request × every visit forever. The math doesn't work even at small scale.
- **Redis-backed cache** — rejected. Adds a third dependency for a sticky-false boolean. Overengineered for a problem the one-way transition already solves.
- **HTTP cache header on a `/_health/bootstrap` endpoint** — rejected. Same problem as Redis, more moving parts, and still doesn't help the proxy directly (proxy can't easily fetch its own routes).
- **DB advisory lock-based detection** — rejected. Locks are for serialising writes, not for caching reads.

---

## 3. How does the wizard's chosen `defaultLocale` reach the magic-link email?

**Decision**: Inside `bootstrapClubAction`, after the DB transaction commits and immediately before `auth.api.signInMagicLink` is called, write the chosen `defaultLocale` to the `NEXT_LOCALE` cookie via `cookies().set(...)`. The existing `sendMagicLink` callback in `lib/auth/better-auth.ts:50-58` calls `await getLocale().catch(() => undefined)` which reads from cookies on the same request context — so it picks up the just-set value within the same server action. The cookie also persists, which is the right UX: the wizard user just told us "this club's default language is X", so their NEXT page load also lands in X.

**Rationale**: This is the minimum-coupling path. The existing spec 007 mailer already accepts a `locale` parameter; the existing Better Auth `sendMagicLink` wrapper already pipes `getLocale()` into it. Nothing in those files changes for spec 009 — the wizard just sets the cookie the existing machinery already reads. No new "override channel", no header injection, no separate mailer entry point.

**Alternatives considered**:
- **Pass `locale` directly to `auth.api.signInMagicLink`** — rejected. Better Auth's API doesn't accept extra metadata that gets forwarded to the `sendMagicLink` callback. Would require either monkey-patching or upstream changes.
- **Stash the locale in a "pending bootstrap" DB row keyed by email; `sendMagicLink` reads it** — rejected. Adds a one-row throwaway table for a single use case. Overengineered.
- **Modify `sendMagicLink` to accept an in-process override** — rejected. Couples the wizard's concern into the generic auth path; future readers of `better-auth.ts` would wonder what the "bootstrap context" is for.
- **Send the email synchronously from the action, bypassing Better Auth's dispatch** — rejected. Would force us to manually generate the magic-link token, replicating Better Auth's internal token generation + verification storage. Maintenance footgun.

---

## 4. What protects against two concurrent bootstrap submissions?

**Decision**: `db.transaction(async tx => { await tx.execute(sql\`SELECT pg_advisory_xact_lock(1008)\`); ... })` inside `bootstrapClubAction`, exactly mirroring the pattern in `lib/auth/bootstrap.ts:39` (spec 008's `promoteFirstUserIfNeeded`) and `lib/auth/actions.ts:184` (spec 008's `requestMagicLinkAction` bootstrap pre-create). The lock key `1008` is shared across all three call sites so the wizard, the spec 008 pre-create, and the spec 008 promotion path all serialise with each other.

After acquiring the lock, re-COUNT `clubs` and `users` inside the same transaction. If either is non-empty, return `{ ok: false, code: 'BOOTSTRAP_ALREADY_COMPLETE' }` without inserting. If both empty, proceed with the inserts. Lock releases automatically on transaction end.

**Rationale**: Postgres rejects `SELECT count(*) ... FOR UPDATE` (aggregate + row-lock incompatible — same error spec 008 hit). The advisory lock is the cleanest serialisation primitive for "check then write" patterns where the check is an aggregate. Sharing the key with spec 008 means a wizard submission and a stranger's accidental sign-in attempt on the same true-fresh deployment serialise correctly: whichever wins inserts the clubs + user rows, the loser's recheck fails and short-circuits with no rows changed.

**Alternatives considered**:
- **Unique constraint on a "bootstrap done" sentinel row** — rejected. Requires a new schema migration for a one-shot signal. Doesn't compose with spec 008's existing lock.
- **PostgreSQL `LOCK TABLE clubs IN ACCESS EXCLUSIVE MODE`** — rejected. Locks the whole table for the duration; spec 008 ruled this out for the same reason (blocks legitimate concurrent reads of clubs from other code paths).
- **Optimistic check without lock + catch unique-constraint violation** — rejected. We don't have a unique constraint that would fire on "second clubs row" (clubs.id is UUID; clubs.name is not unique). Adding one purely for this purpose is over-restrictive (a future multi-club spec might want same-named clubs in different tenants).

---

## 5. Better Auth `disableSignUp: true` + brand-new user — does this work?

**Decision**: Yes — pattern already established in spec 008. The wizard pre-creates the `users` row with `emailVerified = false` inside the same transaction as the clubs insert. By the time `auth.api.signInMagicLink` is called, Better Auth's `disableSignUp: true` check finds an EXISTING user (created by us seconds earlier) and proceeds to dispatch the magic link. Clicking the link triggers verify, which creates the session, which fires the `session.create.after` hook from `lib/auth/better-auth.ts:92`, which runs `promoteFirstUserIfNeeded` — and at that point the clubs row exists (we created it in the wizard transaction), so spec 008's promotion path executes without modification.

**Rationale**: Spec 008's `requestMagicLinkAction` bootstrap branch (`lib/auth/actions.ts:165-200`) already proves the pattern. The wizard is structurally the same — pre-create user row, dispatch link, let the existing verify + promotion fire. The only difference is the wizard also creates the clubs row at pre-create time, which is exactly the leg spec 008 left out.

**Alternatives considered**:
- **Flip `disableSignUp` to `false` temporarily during the wizard call** — rejected. Stateful flag toggling across concurrent requests is a recipe for "we accidentally allowed public sign-ups for 30 seconds while a wizard was open". The pre-create pattern keeps the toggle invariant.
- **Use Better Auth's `auth.api.signUp` directly** — rejected. Spec 008 deliberately avoided this so the user record's `emailVerified` stays false until verify completes; signUp would set it true synchronously.

---

## 6. How does the wizard form handle currency case ("czk" vs "CZK")?

**Decision**: The Zod schema's currency field uses `.transform((v) => v.toUpperCase().trim())` before `.regex(/^[A-Z]{3}$/)`. The form accepts either case at input time; the schema canonicalises before validating and before writing to the DB. The persisted value is always uppercase.

**Rationale**: Spec assumption: "Currency input is permissive of case". A first visitor typing `czk` on a phone shouldn't fail validation on a capitalisation quibble. The existing v1.8 `clubConfigSchema` is strict-case (for admin edits, where the admin has already seen the canonical value once); the wizard relaxes for first-touch UX. Transform-then-validate keeps the schema declarative and the persisted form canonical.

**Alternatives considered**:
- **Auto-uppercase on every keystroke via `onInput`** — rejected. Cursor-jump bugs, accessibility friction for users using on-screen keyboards.
- **Accept any case at input, uppercase at server-action level (outside the schema)** — rejected. Splits validation logic across schema and action; future readers can't tell from the schema alone what's accepted.

---

## 7. What happens to `scripts/db-reset.ts` and `pnpm db:seed`?

**Decision**: Both stay. `scripts/seed.ts` retains its existing behaviour (insert clubs + banking + admin user + admin member, all idempotent) for CI fixtures and developer-machine repeatability. `scripts/db-reset.ts` keeps both `pnpm db:reset` (bare) and `pnpm db:reset:bootstrap` (wipe + insert one club). The bare form becomes the canonical "test the spec 009 onboarding wizard from a true-fresh state" reset; the `:bootstrap` form remains for testing the spec 008 promotion path in isolation. Documentation update is light — a paragraph at the top of `scripts/db-reset.ts` noting the new role of bare reset.

**Rationale**: Tests need both shapes. Removing `pnpm db:seed` would break CI and the local-dev "I want a working admin without going through the wizard" shortcut. Removing `db:reset:bootstrap` would leave no way to test the spec 008 promotion path independently of spec 009. Keep both, document the new default.

**Alternatives considered**:
- **Delete `scripts/seed.ts` entirely** — rejected. CI uses it; many tests use the same path indirectly (the E2E rig's `tests/e2e/fixtures/seed.ts` calls the same insert pattern). Removal would cascade through the test infrastructure.
- **Rename `db:reset:bootstrap` to `db:reset:legacy`** — considered, rejected. The script still has a legitimate testing role (spec 008 promotion path in isolation); "legacy" implies it's slated for removal, which it isn't.

---

## 8. Testing strategy

**Decision**:
- **Unit (Vitest + PGlite via `vi.mock('@/lib/db/client')`)**:
  - `tests/unit/onboarding-schema.spec.ts` — every Zod validation edge case: empty club name, 120-char (boundary), 121-char, mixed-case currency, 2-letter currency, locale not in `routing.locales`, malformed email shapes.
  - `tests/unit/onboarding-action.spec.ts` — `bootstrapClubAction` state machine: happy path (state A → B), post-bootstrap reject (state ≠ A), race safety (`Promise.all` two concurrent calls → exactly one wins with `BOOTSTRAP_ALREADY_COMPLETE` returned to the loser), no email dispatched on validation failure, no rows inserted on validation failure.
  - `tests/unit/bootstrap-state.spec.ts` — `isFreshDeployment()` cache: null → true (queries DB), null → false (queries DB + caches), false → false (no query), `invalidateFreshDeploymentCache()` → null (re-queries on next call).
- **E2E (Playwright against production build + isolated test DB + Mailpit)**:
  - `tests/e2e/onboarding.spec.ts` — US1 happy: empty DB → hit `/`, redirected to `/cs/setup` (default locale), submit form, magic-link arrives at Mailpit in Czech, click link, lands at `/`, members row with `role='club_admin'` asserted in DB. US2 invisibility: post-bootstrap → `/setup` returns 3xx to `/sign-in` (anonymous) / `/` (signed-in). US3 validation: bad currency → inline error visible, no insert. US4 i18n: `/en/setup` renders English copy; switching locale mid-form preserves field values.

**Rationale**: Mirrors the spec 008 test split exactly (see `tests/unit/bootstrap-rule.spec.ts` + `tests/e2e/admin-config.spec.ts`). Unit tests cover the state machine + validation matrix in milliseconds; E2E covers the proxy redirect + email delivery + magic-link round-trip in seconds. Each acceptance scenario in spec.md maps to one Playwright assertion (constitution Gate 5 requirement).

**Alternatives considered**:
- **Skip unit tests, rely entirely on E2E** — rejected. Constitution Gate 5 also requires unit + integration tests for non-trivial logic; the race-safety test in particular needs the millisecond control PGlite gives.
- **Mock Better Auth's `signInMagicLink` in unit tests** — rejected for the action test (the contract is what gets called, not the dispatched email — the action test asserts `signInMagicLink` was invoked with the right args, leaving the email itself to E2E + Mailpit).

---

## 9. Proxy.ts redirect mechanics — preserving the locale through the redirect

**Decision**: Inside the proxy, resolve the locale BEFORE building the redirect URL. The order: (1) URL prefix match (`/cs/...` → `cs`, `/en/...` → `en`); (2) `NEXT_LOCALE` cookie if no prefix; (3) `routing.defaultLocale` (`cs`) as the final fallback. Build the redirect URL as `/<resolved-locale>/setup` (or `/<resolved-locale>/sign-in` / `/<resolved-locale>/`). For the default locale `cs`, omit the prefix to match next-intl's convention (`cs` is the unprefixed default).

**Rationale**: Spec assumption: "Wizard runs inside the existing `[locale]` route group". A bare `/setup` redirect would be ambiguous (no locale) and would itself be redirected by next-intl's middleware in the next pass — wasting a roundtrip and potentially landing in the wrong locale. Resolving locale first is the single-redirect path.

**Alternatives considered**:
- **Always redirect to `/cs/setup`** — rejected. Breaks the English-preferring visitor's experience; they'd see the wizard in Czech then have to manually flip via the locale switcher.
- **Resolve locale inside `app/setup/page.tsx`** — rejected. `/setup` isn't under `[locale]/`, so the page wouldn't exist; we'd need a parallel non-localised tree.
