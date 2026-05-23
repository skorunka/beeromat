# Feature Specification: Allowlist Feedback & Sign-in Recovery (v1.5)

**Feature Branch**: `006-allowlist-feedback`

**Created**: 2026-05-23

**Status**: Draft

**Input**: User description: "Display message when the user is not found in the allowed list, explain why and what needs to be done, in a funny way. Also add a back link so the user can retry the sign-in request."

Today's sign-in flow (v1.0 contract — `specs/001-beer-consumption-ledger/contracts/auth.md`)
is **privacy-by-default**: any email submitted to the magic-link form
gets the same `{ ok: true }` response, regardless of whether the email
is on the club's member/invitation allowlist. The UI then shows
"Link sent — check your email." universally. Two paper cuts follow:

1. A member who is **not yet on the allowlist** (a guest, a new member
   the admin hasn't invited yet, a typo) waits forever for a magic link
   that will never arrive, with no signal about *why* and no
   instruction about *what to do*.
2. A member who **mistyped their email** (or wants to try another) is
   stuck on the "Link sent" confirmation screen with no way back to
   the form except the browser back button — which doesn't reset the
   form state cleanly.

v1.5 closes both gaps with **two presentation/affordance changes** on
the sign-in form, plus **one deliberate, narrowly-scoped contract
change** that supersedes a single response shape from the v1.0 auth
contract. The threat-model reasoning is documented below; in summary,
for a closed single-club deployment whose members already know each
other socially, the email-enumeration risk that drove the v1.0 always-silent
posture is essentially zero, while the UX cost of that posture is
real and recurring.

## Personas *(mandatory — constitution v1.4.0)*

Carried from prior specs, narrowed to the three who actually touch the
sign-in screen during this feature.

- **P1 — Standa, 67 · Stock manager**: Basic, small old Android, large fingers, reading glasses. He occasionally fat-fingers his own email at the sign-in screen. Today he has no recovery — the silent-success flow tells him "Link sent" even when nothing was sent. He's the persona this feature serves first.
- **P3 — Tereza, 34 · Member**: iPhone, fluent. New to the club; she's heard about beeromat from a friend and tries to sign in before the admin has invited her. The silent-success flow tells her nothing — she sits and waits for an email that will never come, then writes the app off as broken.
- **P5 — Pavel, 45 · Club admin**: Sets the club up. He's the answer to "what to do" — the message must point Tereza at him. He doesn't himself touch the sign-in form much (he's already signed in), but the not-on-allowlist message must name him as the resolution path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Friendly "not on the allowlist" message (Priority: P1)

When the submitted email is not in the club's member/invitation
allowlist, the form returns the user to a distinct screen that
(a) tells her the email isn't on the list, (b) explains why (only
people the club admin has added can sign in), (c) tells her what to
do (talk to the club admin), and (d) keeps the tone light — the
copy reads like a sentence the admin would say at the bar, not an
auth-system error.

**Why this priority**: This is the core feature. Without it, P3 has no
path forward and P1 has no way to know his typo failed. Implementing
just this story (without US2) already delivers value — both personas
get a useful signal, even if they then have to refresh the page to try
again.

**Independent Test**: A signed-out browser submits an unknown email to
the sign-in form; the response renders the dedicated not-on-list
screen with the funny copy and an explicit "talk to your club admin"
sentence. A signed-out browser submits a known email; the response
renders the existing "Link sent — check your email." screen unchanged.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **P3 (Tereza, new member, not yet invited)** — **Given** her email is not in any `members` or pending `invitations` row, **When** she submits the form with a valid Turnstile token, **Then** she sees the dedicated not-on-allowlist screen with the funny copy + admin-resolution sentence (in Czech if her browser language is `cs`, in English otherwise).
2. **P1 (Standa, mistyped his real email)** — **Given** he typed `stnada@…` instead of `standa@…`, **When** he submits, **Then** he sees the not-on-allowlist screen — he can recognise the typo from the message and use the retry link (US2) to fix it.
3. **P3 (Tereza, after admin invites her)** — **Given** Pavel has just sent her an invitation, **When** she retries the sign-in with the now-on-list email, **Then** she sees the existing "Link sent — check your email." screen (the prior path is unchanged for on-list emails).

---

### User Story 2 — Use-a-different-email retry link (Priority: P2)

Both the existing "Link sent" screen and the new not-on-allowlist
screen show a small "Use a different email" link that returns the user
to the form, cleared. The form is re-armed: a fresh Turnstile challenge
is solved, a new email can be typed.

**Why this priority**: P2 because US1 is functional without it — the
user can refresh the page as a workaround. But the retry link removes
the only remaining cliff edge (the post-send confirmation screen is
otherwise a dead end), and it's the natural pair to US1's not-on-list
message.

**Independent Test**: After reaching either the link-sent or
not-on-allowlist screen, clicking the retry link returns the user to
an empty form with focus on the email field; submitting again works
end-to-end.

**Acceptance Scenarios**:

1. **P1 (Standa, after seeing not-on-list)** — **Given** he is on the not-on-allowlist screen because of a typo, **When** he taps "Use a different email," **Then** the empty sign-in form re-renders with his email field focused.
2. **P1 (Standa, after a successful send to the wrong-but-on-list email)** — **Given** he is on the "Link sent" screen but realises the email he typed goes to an inbox he can't check today, **When** he taps "Use a different email," **Then** the form re-renders so he can submit a different address.
3. **Any persona** — **Given** they are back on the form via the retry link, **When** they submit a known email, **Then** the full end-to-end magic-link flow works (no stale Turnstile token, no double-submit).

---

### Edge Cases

- **Rate-limited email submits an unknown address.** The rate limiter currently absorbs the request silently. After v1.5 the rate-limited path returns `{ ok: true, status: 'rate-limited' }` from the client perspective — the user sees the existing "Link sent" screen, **not** the not-on-allowlist screen, even if the email is unknown. We deliberately preserve the silent-absorb behaviour for rate-limited requests because the rate-limit signal *is* an enumeration risk the v1.0 contract correctly identified.
- **Turnstile token invalid or missing.** Same: returns the "Link sent" screen (the form's submit button is already gated on Turnstile success, so this path should not be reachable from the normal UI — but a hostile/script client gets the same answer it always got).
- **Email parses as a valid-looking address but contains junk** (e.g. `a@a`). Treated as unknown — the user sees the not-on-allowlist screen with the same copy.
- **Already-accepted invitation, but member row was later deactivated.** The member is no longer in the active allowlist; she sees the not-on-allowlist screen, with the same admin-resolution path. (The admin can re-activate her.)
- **i18n.** Both new copy strings (the not-on-list message and the retry-link label) ship in `cs` and `en` from day one — the i18n parity gate (`pnpm i18n:check`) MUST pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `requestMagicLinkAction` server action MUST return one of three distinguishable client outcomes: `{ ok: true, status: 'sent' }` (an allowlisted email; magic link dispatched), `{ ok: true, status: 'not-on-allowlist' }` (the email is not in any active `members` row and has no pending `invitations` row), `{ ok: true, status: 'rate-limited' }` (Turnstile failed, rate limit hit, or malformed email — all collapsed into one status to preserve the v1.0 silent-absorb behaviour for these classes).
- **FR-002**: The sign-in form MUST render three distinct presentation states corresponding to the three statuses above: the existing "Link sent" screen for `sent`, a new "not on the allowlist" screen for `not-on-allowlist`, and the same "Link sent" screen for `rate-limited` (the user MUST NOT be able to distinguish `sent` from `rate-limited` from the UI).
- **FR-003**: The not-on-allowlist screen MUST display copy that (a) names the situation in plain language, (b) explains the cause (only people the club admin has added can sign in), and (c) names the resolution (talk to your club admin). The copy MUST be light in tone — friendly, not error-like.
- **FR-004**: Both the "Link sent" screen and the not-on-allowlist screen MUST show a "Use a different email" affordance that returns the user to the empty form with focus on the email field, with a fresh Turnstile challenge.
- **FR-005**: All new user-facing strings MUST exist in both `messages/cs.json` and `messages/en.json`; `pnpm i18n:check` MUST pass.
- **FR-006**: The v1.0 contract at `specs/001-beer-consumption-ledger/contracts/auth.md` MUST be superseded for `requestMagicLinkAction` by a new contract document at `specs/006-allowlist-feedback/contracts/auth.md`. The v1.0 contract file MUST be annotated to point at the supersession (a single line at the top), so future readers do not read it as still authoritative.

### Security Requirements *(this feature changes the security posture)*

- **SR-001**: The change deliberately allows a client to distinguish "this email is on the club allowlist" from "this email is not." This is **email enumeration by design** within a narrowly defined threat model: a closed single-club deployment where (a) club admins already know every member's email (they invited them), and (b) any current member can socially ask another member "is X@club.cz one of us?". The enumeration adversary value is therefore approximately zero for the threatened information.
- **SR-002**: The rate-limit path and the Turnstile-failed path MUST remain in the `rate-limited` bucket (FR-001/FR-002) — those signals **do** carry adversary value (knowing the rate-limit is engaged tells an attacker whether to back off) and **are not** what this feature is trading away.
- **SR-003**: The existing rate limiting (`checkMagicLinkLimits` on email + IP) MUST continue to apply to all submitted emails including unknown ones. An attacker who enumerates the allowlist still hits the rate limiter at the same threshold — the enumeration is not free.

### Key Entities

None. This feature changes presentation and one server-action contract; no schema changes, no new tables, no new columns.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user who submits an unknown email sees the not-on-allowlist screen within the same response time as the existing flow (p95 < 1.5s including Turnstile + rate-limit check).
- **SC-002**: A user who submits a known email sees the **identical** "Link sent" screen they see today (zero visible change for the on-list path).
- **SC-003**: The retry link reliably returns the user to a working form in one tap; submitting again from that form succeeds end-to-end with no stale-token failures.
- **SC-004**: The i18n catalog parity gate (`pnpm i18n:check`) and all seven constitution verification gates pass after the implementation.

## Assumptions

- This is a **single-club** deployment (the v1 product shape). Multi-tenant or invite-only-by-domain deployments would require revisiting SR-001's threat model.
- The Czech and English copy strings are written by Claude during implementation and reviewed by the user — they are not procured from a translator.
- No E2E test of the sign-in form's not-on-allowlist path is added in v1.5 if the existing E2E covers the on-list path; a unit test of `requestMagicLinkAction`'s status output is sufficient. (The user can decide to upgrade to an E2E test if the on-list E2E regresses.)
- The "Use a different email" link uses the existing Turnstile widget's re-arming behaviour — no new Turnstile integration work is required.
