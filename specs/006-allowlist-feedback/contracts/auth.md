# Contract: Authentication — v1.5 supersession

**Feature**: `006-allowlist-feedback` | **Phase**: 1 — Design | **Supersedes**: `specs/001-beer-consumption-ledger/contracts/auth.md` § `SA requestMagicLink`

This document supersedes a **single Server Action contract** in the v1.0
auth contract — the response shape of `requestMagicLinkAction`. Every
other section of `specs/001-beer-consumption-ledger/contracts/auth.md`
(the Better Auth route handler, `acceptInvitation`, the PIN actions,
sign-out) remains in force unchanged.

---

## `SA` `requestMagicLink({ email, turnstileToken }) → { ok, status }`

The Server Action wrapping Better Auth's magic-link send so we can
layer Turnstile + rate limiting, **and so that an unknown-email
submission produces a distinguishable client outcome** (the change
that motivates this spec).

**Input** *(unchanged from v1.0)*:
```ts
z.object({
  email: z.string().email().toLowerCase(),
  turnstileToken: z.string().min(1),
});
```

**Output** *(changed from v1.0)*:
```ts
type Status = 'sent' | 'not-on-allowlist' | 'rate-limited';
type Response = { ok: true; status: Status };
```

The three statuses partition the v1.0 universal `{ ok: true }` reply
along the line drawn by the v1.5 threat-model reasoning (see spec.md
§Security Requirements):

| Status | When | Client sees |
|---|---|---|
| `sent` | Email is an active member or has a pending invitation; Turnstile passed; not rate-limited; Better Auth dispatched the magic link (or attempted to). | The existing "Link sent — check your email." screen. |
| `not-on-allowlist` | Turnstile passed AND not rate-limited AND the email matches no active member and no pending invitation. | A new dedicated screen with the friendly explainer copy and the "talk to your club admin" sentence. |
| `rate-limited` | Turnstile verification failed OR the per-email/per-IP rate limit triggered OR the input did not parse as an email at all. | The **same** "Link sent — check your email." screen as `sent`. The client cannot distinguish `sent` from `rate-limited`. |

**Behaviour**:
1. Parse + normalise the email. Malformed → return `{ ok: true, status: 'rate-limited' }` (collapsed into the silent bucket on purpose — see SR-002).
2. Verify Turnstile token. Failed → return `{ ok: true, status: 'rate-limited' }`, log a warning.
3. Check rate limits (per-email + per-IP via Upstash). Violated → return `{ ok: true, status: 'rate-limited' }`, log.
4. Look up the email in `members` (active rows) and in `invitations` (pending rows). If neither matches → return `{ ok: true, status: 'not-on-allowlist' }`, log.
5. Invoke Better Auth's magic-link send. Return `{ ok: true, status: 'sent' }` regardless of whether the actual SMTP send succeeded (the send-side errors stay server-side, as in v1.0 — they are operational concerns, not allowlist signals).

**Errors**: as in v1.0, errors are never bubbled to the client as
errors. The `status` discriminator surfaces *intent* (sent vs not on
list vs absorbed) — operational failures (SMTP down, Better Auth
exception) are logged and presented to the client as `sent`, so a
user whose magic link genuinely failed to dispatch still sees the
"check your email" screen and can retry.

**FR** *(from spec 006)*: FR-001, FR-002, FR-006.

**SR** *(from spec 006)*: SR-001, SR-002, SR-003.

---

## Threat-model addendum — why the change is safe

The v1.0 contract refused to distinguish `sent` from `not-on-allowlist`
to prevent an attacker from enumerating the club's member list by
submitting candidate emails and observing the response. The v1.5
threat model re-examines this for the actual beeromat product shape:

- **Closed single-club deployment.** Every member was invited by the
  club admin, who already knows every member's email. The information
  "is X@club.cz on the list" is not secret from the people who have
  reason to want it.
- **Social discoverability.** Any current member can ask another
  current member "is X one of us?". The enumeration channel exists
  socially, independent of the auth UI.
- **Adversary value ≈ 0.** An attacker who learns "yes, frantisek@club.cz
  is a member" gains no actionable capability — they still need
  frantisek's mailbox to receive the magic link, frantisek's PIN to
  unlock the device session, and frantisek's club membership to read
  any data once signed in.

The signals that **do** carry adversary value — knowing whether the
rate limiter is engaged, or whether Turnstile is gating the request —
are explicitly NOT exposed (the `rate-limited` bucket collapses them
into the `sent` UI screen).
