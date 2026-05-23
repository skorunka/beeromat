# Contract: Authentication

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions, queries, and route handlers for sign-in, PIN setup, daily unlock, and sign-out. Better Auth owns the magic-link side; this contract describes the **device-PIN service** layered on top plus the Server Actions that the UI calls.

Notation:
- `SA` = Server Action (`'use server'`, called from a Client Component form or programmatic invocation).
- `Q` = Query (Server Component data fetch, plain async function).
- `RH` = Route Handler (file-based, `route.ts`).
- Each operation lists: **input** (Zod schema sketch), **output**, **errors**, **role**, **related FR**.

---

## `RH` `GET|POST /api/auth/[...all]` — Better Auth mount

Standard Better Auth Next.js handler. Handles magic-link request, verification callback, session creation, and sign-out. We do not customise this mount; configuration is in `lib/auth/better-auth.ts`.

**FR**: FR-001, FR-002, FR-006.

---

## `SA` `requestMagicLink({ email, turnstileToken }) → { ok }`

> **Superseded by `specs/006-allowlist-feedback/contracts/auth.md`** (v1.5, 2026-05-23). The response shape changes from `{ ok: true }` to `{ ok: true, status: 'sent' | 'not-on-allowlist' | 'rate-limited' }`; the threat-model reasoning is documented there. The rest of this contract file (Better Auth route, `acceptInvitation`, PIN actions, sign-out) is NOT superseded and remains authoritative.

The Server Action wrapping Better Auth's magic-link send so we can layer Turnstile + rate limiting.

**Input**:
```ts
z.object({
  email: z.string().email().toLowerCase(),
  turnstileToken: z.string().min(1),
});
```

**Output**: `{ ok: true }` — **always returned** for any submitted email (no enumeration). Errors are logged server-side but the UI message is identical for "invalid email," "no invitation," "rate-limited," "Turnstile failed."

**Behaviour**:
1. Verify Turnstile token via POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`. On failure → return `{ ok: true }`, log a warning.
2. Check Upstash rate limits (per-email: 3/hour, per-IP: 10/hour). On violation → return `{ ok: true }`, log.
3. Check `invitations` table for an open invitation OR `members` table for an active member with this email. If neither → return `{ ok: true }`, log.
4. Invoke Better Auth's `signIn.magicLink({ email })` to dispatch the email via Resend.

**Errors**: never bubbled to the client — always `{ ok: true }`. Logging surfaces real failures.

**FR**: FR-001, FR-002, FR-006, FR-007.

---

## `SA` `acceptInvitation({ token, displayName, pin, deviceLabel? }) → { ok, sessionToken }`

Called from the invitation landing page (`/invitation/[token]`) after the user fills in display name + PIN.

**Input**:
```ts
z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^\d{4}$/),
  deviceLabel: z.string().max(100).optional(),
});
```

**Output**: `{ ok: true, sessionToken: string }` — also sets the Better Auth session cookie and a fresh `device_id` cookie.

**Behaviour** (one transaction):
1. Look up `invitations.token_hash` matching argon2id of `token`; verify `status = 'pending'` and `expires_at > now()`. On failure → `{ ok: false, code: 'INVALID_INVITATION' }`.
2. Create or attach a Better Auth `users` row for the invitation's email.
3. Insert a `members` row (club, user, role from invitation, `display_name`, `accepted_invitation_at = now()`).
4. Update `invitations` → `status = 'accepted'`, `accepted_at`, `accepted_by_user_id`.
5. Generate a new `device_id` (UUID), insert a `device_sessions` row with argon2id-hashed PIN.
6. Set cookies: Better Auth session + `device_id` (HttpOnly, Secure, SameSite=Lax, 365-day max-age).

**Errors**:
- `INVALID_INVITATION` — token wrong, expired, or already accepted.
- `WEAK_PIN` — PIN doesn't match `^\d{4}$` (defensive; the Zod schema catches it first).

**Role**: none (pre-auth).

**FR**: FR-003 (PIN setup), FR-009 (role assignment).

---

## `SA` `unlockDevice({ pin }) → { ok }`

Called from the PIN-gate component on every protected route load (or only when `last_unlock_at` is older than `device_inactivity_lock_seconds`, depending on UX iteration).

**Input**:
```ts
z.object({ pin: z.string().regex(/^\d{4}$/) });
```

**Output**: `{ ok: true }` or `{ ok: false, code, attemptsRemaining? }`.

**Behaviour**:
1. Read `device_id` cookie. If missing → `{ ok: false, code: 'NO_DEVICE_SESSION' }` (forces fresh magic link).
2. Look up `device_sessions` row by id. If missing → same error.
3. If `locked_until > now()` → `{ ok: false, code: 'LOCKED' }`. UI shows "Sign in again via email."
4. `argon2.verify(pin_hash, pin)`:
   - On success: reset `failed_attempts = 0`, set `last_unlock_at = now()`, return `{ ok: true }`.
   - On failure: increment `failed_attempts`. If reaches 5 → `locked_until = now() + interval '100 years'` (effectively permanent) AND invalidate the Better Auth session for this device. Return `{ ok: false, code: 'WRONG_PIN', attemptsRemaining: 5 - failed_attempts }`.

**Errors**: see codes above.

**Role**: authenticated (Better Auth session required); the PIN unlock is the second factor.

**FR**: FR-004, FR-005, FR-008.

---

## `SA` `setNewPin({ currentPin, newPin }) → { ok }`

Self-service PIN change while still unlocked. Requires the current PIN to prevent a friend grabbing the unlocked phone and changing it.

**Input**:
```ts
z.object({
  currentPin: z.string().regex(/^\d{4}$/),
  newPin: z.string().regex(/^\d{4}$/),
});
```

**Output**: `{ ok: true }` | `{ ok: false, code: 'WRONG_CURRENT_PIN' }`.

**Behaviour**: verify `currentPin` (same path as unlock), then `argon2.hash(newPin)` and update `device_sessions.pin_hash`.

**Role**: authenticated + device unlocked.

**FR**: FR-008.

---

## `SA` `signOutDevice() → { ok }`

Sign out of this device (invalidates Better Auth session and removes `device_sessions` row).

**Input**: none.

**Output**: `{ ok: true }`. Redirects to `/sign-in`.

**Behaviour**: delete `device_sessions` row (legitimate hard-delete; auth machinery, not domain history per Principle V), invalidate Better Auth session, clear cookies.

**Role**: authenticated.

---

## `Q` `currentSession() → { user, member, club, deviceSession } | null`

The universal Server Component helper for resolving the current authenticated context.

**Returns**:
```ts
{
  user: { id, email, name } | null,
  member: { id, clubId, role, displayName, isActive } | null,
  club: { id, name, currencyCode, defaultLocale, … } | null,
  deviceSession: { id, lastUnlockAt, locked: boolean } | null,
}
```

`null` if no Better Auth session. `deviceSession.locked = true` (or absent) means the UI must render the PIN gate before any protected content.

**Implementation**: wraps Better Auth's `auth.api.getSession()` and joins to `members`, `clubs`, `device_sessions` via the `device_id` cookie.

---

## Role helpers (used across all other contracts)

These are not exposed as Server Actions but used internally:

```ts
async function requireMember(): Promise<MemberContext>            // throws 401 if no session
async function requireRole(...roles: Role[]): Promise<MemberContext>  // throws 403 if member.role not in roles
async function requireUnlocked(): Promise<MemberContext>          // throws if device session locked
```

Every Server Action below begins with one of these calls.

---

## Cookies set by this contract

| Cookie | Purpose | Attributes |
|---|---|---|
| `better-auth.session` | Better Auth session token | HttpOnly, Secure, SameSite=Lax, configurable max-age |
| `device_id` | Stable identifier for `device_sessions` lookup | HttpOnly, Secure, SameSite=Lax, 365-day max-age |
| `NEXT_LOCALE` | next-intl preference | not HttpOnly (read by client), 365-day max-age |
