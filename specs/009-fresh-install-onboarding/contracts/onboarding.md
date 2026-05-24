# Contract: Fresh-Install Onboarding Wizard (v1.9)

**Feature**: `009-fresh-install-onboarding` | **Phase**: 1 — Design

Two contracts:

1. **New** Server Action `bootstrapClubAction` — what the wizard form invokes when submitting.
2. **Extension** to the proxy (`proxy.ts`) — fresh-state detection and redirect.

Both compose with already-shipped contracts:
- `lib/auth/actions.ts::requestMagicLinkAction` (spec 006 + 008 bootstrap pre-create) — UNCHANGED.
- `lib/auth/bootstrap.ts::promoteFirstUserIfNeeded` (spec 008) — UNCHANGED, fires from the same `session.create.after` databaseHook with no awareness of which entry point pre-created the user.

---

## 1. `SA` `bootstrapClubAction(input) → { ok, code, status? }`

The onboarding wizard's submit action. Validates, transactionally creates the bootstrap rows, dispatches the magic link.

**Input**:

```ts
{
  clubName: string,              // 1-120 chars after trim
  currencyCode: string,          // ISO 4217 shape (^[A-Z]{3}$) after uppercase + trim
  defaultLocale: 'cs' | 'en',    // one of routing.locales
  adminEmail: string,            // RFC-5322-shaped after trim + lowercase
}
```

The Zod schema at `lib/validation/onboarding.ts` is the authoritative shape — both the client form's resolver and the action's server-side guard use it. Currency case is permissive at input (`czk` accepted; transform uppercases before regex check); the persisted value is always uppercase.

**Output**:

```ts
type Code =
  | 'OK'
  | 'VALIDATION_FAILED'
  | 'BOOTSTRAP_ALREADY_COMPLETE';

type Response =
  | { ok: true; code: 'OK' }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'BOOTSTRAP_ALREADY_COMPLETE' };
```

| Code | When | Client sees |
|---|---|---|
| `OK` | Validation + transaction + magic-link dispatch all succeeded. | `router.push('/sign-in?bootstrap-sent=1')` (or equivalent confirmation route) telling the user to check their email. |
| `VALIDATION_FAILED` | Zod parse rejected the input. | Per-field `FormMessage` errors render with catalog strings from `onboarding.errors.*`. No DB writes occurred, no email sent. |
| `BOOTSTRAP_ALREADY_COMPLETE` | At submit time the recheck inside the transaction saw clubs count > 0 OR users count > 0 — someone else (concurrent wizard submit, or a `pnpm db:seed` operator) completed bootstrap first. | Friendly message: "Looks like someone just finished setting up. Go sign in instead." with a link to `/sign-in`. |

**Behaviour**:

1. Parse the input through the shared Zod schema. Failure → `VALIDATION_FAILED` with field errors mapped from Zod's issue list (same mapping the spec 008 admin form uses).
2. Open a single Drizzle transaction:
   - `await tx.execute(sql\`SELECT pg_advisory_xact_lock(1008)\`)` — same key as spec 008's two bootstrap entry points so all three serialise.
   - Re-COUNT `clubs` and `users`. If either > 0 → return `BOOTSTRAP_ALREADY_COMPLETE` without inserting (transaction rolls back, lock releases).
   - `INSERT INTO clubs (name, currency_code, default_locale) VALUES (...) RETURNING id`.
   - `INSERT INTO club_banking_profiles (club_id) VALUES (<just-inserted clubs.id>)`.
   - `INSERT INTO "user" (id, email, name, emailVerified) VALUES (<UUID>, <email>, <local-part of email>, false)`.
   - If any insert throws → transaction rolls back, surface as a generic error (same handling the spec 008 action uses for unexpected DB errors). The advisory lock releases on rollback.
3. Outside the transaction (but still inside the action, post-commit):
   - `cookies().set('NEXT_LOCALE', input.defaultLocale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })` — so the existing `sendMagicLink` callback's `getLocale()` returns the chosen locale within the same request context (research.md §3) AND the user's next page load also lands in their chosen language.
   - Call `lib/db/queries/bootstrap-state.ts::invalidateFreshDeploymentCache()` — flips the in-process sticky cache to `false` so subsequent proxy calls return immediately (research.md §2).
   - `await auth.api.signInMagicLink({ body: { email: input.adminEmail }, headers: await headers() })`. Better Auth's `sendMagicLink` callback at `lib/auth/better-auth.ts:50-58` reads `getLocale()` and dispatches the email through the spec 007 i18n-aware mailer.
   - `revalidatePath('/', 'layout')` — invalidates any cached pages so the post-bootstrap state is seen everywhere.
   - Return `{ ok: true, code: 'OK' }`.

**Defence in depth (FR-012)**:

The action ALWAYS runs the in-transaction recheck even though the proxy is supposed to redirect post-bootstrap `/setup` visits before the action is reached. If a malicious caller crafts a direct POST to the action's URL, the recheck blocks the second clubs insert. The proxy is a UX layer; the action is the security boundary.

**RBAC**:

The action does NOT call `requireMember()` or `requireRole()`. By construction the only state in which the action can succeed is state X (clubs empty, users empty) — in that state, no member exists yet, so any RBAC check would reject every caller. The state-based gate IS the access control.

**FR** (from spec.md): FR-001, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-012, FR-014.

---

## 2. `PROXY` `proxy(request) → NextResponse` (extension to the existing `proxy.ts`)

The Next.js 16 proxy that already runs next-intl's locale routing now also enforces the fresh-state redirect.

**Trigger**: every request matching the existing `proxy.ts:config.matcher` (excludes `/api`, `_next/static`, `_next/image`, favicon, root metadata icon routes, and any path with a file extension).

**Decision matrix**:

| State (cached `isFreshDeployment()`) | Path matches `/{locale}/setup` or `/setup` | Behaviour |
|---|---|---|
| `true` (fresh) | YES | Hand off to next-intl middleware as-is — let the wizard render. |
| `true` (fresh) | NO | Redirect to `/<resolved-locale>/setup` (303). Resolved locale precedence: URL prefix > `NEXT_LOCALE` cookie > `routing.defaultLocale`. The default locale `cs` is unprefixed (matches next-intl convention), so the redirect target for a `cs`-resolved visitor is `/setup`, not `/cs/setup`. |
| `false` (bootstrapped) | YES | Anonymous → redirect to `/<resolved-locale>/sign-in` (303). Signed-in (any role — admin OR regular member) → redirect to `/<resolved-locale>/` (303). Signed-in check uses the Better Auth session cookie presence; full session validation happens in the destination route's layout. |
| `false` (bootstrapped) | NO | Hand off to next-intl middleware as-is — normal site behaviour. |

**`isFreshDeployment()` semantics** (`lib/db/queries/bootstrap-state.ts`):

```ts
let isFreshCached: boolean | null = null;

export async function isFreshDeployment(): Promise<boolean> {
  if (isFreshCached === false) return false;   // sticky once falsified
  const r = await db.execute<{ clubs: string; users: string }>(sql`
    SELECT
      (SELECT count(*)::text FROM clubs) AS clubs,
      (SELECT count(*)::text FROM "user") AS users
  `);
  const fresh = Number(r.rows[0]?.clubs ?? 0) === 0 && Number(r.rows[0]?.users ?? 0) === 0;
  if (!fresh) isFreshCached = false;
  return fresh;
}

export function invalidateFreshDeploymentCache(): void {
  isFreshCached = null;
}
```

The cache transition is **strictly one-way** (research.md §2): once falsified, stays false for the process lifetime. New processes (Vercel cold-start) pay one DB roundtrip on their first request, then zero. The `invalidate` is called by `bootstrapClubAction` post-commit so the same process that just bootstrapped sees the false state on its very next call without a re-query.

**Why this is in the proxy, not in `app/[locale]/setup/page.tsx`**:

A page-level guard would render the wrong tree once before redirecting on the client (visible flash on slow mobile, breaks SC-003). Proxy-level redirect lands before any RSC streaming begins.

**Exemptions** (already covered by `proxy.ts:config.matcher`):

- `/api/auth/magic-link/verify` — the verify endpoint MUST stay reachable in state A so the wizard-dispatched magic link works. `/api` is excluded from the matcher.
- Static assets, metadata icons — same matcher exclusion.

**FR** (from spec.md): FR-001, FR-002, FR-007 (locale resolution), FR-010, FR-011.

---

## Cross-reference: state transitions

```
                          bootstrapClubAction (spec 009)
                          ────────────────────────────────►
       ┌──────────────┐                                        ┌──────────────┐
       │  State X     │                                        │  State A     │
       │  clubs=0     │  ◄──── never goes backwards ────────   │  clubs=1     │
       │  users=0     │                                        │  users=1     │
       │  members=0   │                                        │  members=0   │
       └──────────────┘                                        └──────────────┘
                                                                       │
                                                                       │ user clicks magic link
                                                                       │ → session.create.after
                                                                       │ → promoteFirstUserIfNeeded
                                                                       ▼
                                                               ┌──────────────┐
                                                               │  State B     │
                                                               │  clubs=1     │
                                                               │  users≥1     │
                                                               │  members≥1   │
                                                               └──────────────┘
```

Spec 009 owns the X → A edge. Spec 008 owns the A → B edge. The advisory lock key `1008` (kept from spec 008 for back-compat) serialises BOTH transitions.
