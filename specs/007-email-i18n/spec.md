# Feature Specification: Localized transactional emails (v1.6)

**Feature Branch**: `007-email-i18n`

**Created**: 2026-05-23

**Status**: Draft

**Input**: User description: "Our emails are English only. Localize the magic-link and invitation emails so the language matches the rest of the user's experience."

The beeromat app surface — every screen, every server-action error
message, every PIN gate — speaks the user's chosen language (Czech by
default, English on demand) via the `messages/{cs,en}.json` catalogs
threaded through `next-intl`. The **two transactional emails the app
sends** are the only surface that doesn't:

- `emails/MagicLinkEmail.tsx` — sent on every sign-in attempt that
  hits the allowlist.
- `emails/InvitationEmail.tsx` — sent by admins when they invite a
  new member to the club.

Both render hardcoded English literals — no `useTranslations`, no
`getTranslations`, no `locale` parameter threaded through
`lib/email/mailer.ts`. A Czech user (the Standa persona — Czech only,
relies on the app being entirely in his language) signs in at a
Czech-rendered form, taps submit, then opens his inbox and finds
"Sign in to beeromat" in English. The mid-flow language switch is
jarring at best and a literal blocker at worst — Standa may not
recognize the email as the one he just requested and may abandon
the 5-minute window debating with it.

v1.6 closes that gap. The two templates become locale-aware, the
mailer takes a locale parameter, and the two call sites
(`requestMagicLinkAction` via Better Auth's `sendMagicLink` callback,
the admin `createInvitation` action) thread the locale from the
request context.

This is **infrastructure-and-i18n work**: zero domain change, zero
public server-action contract change (the only signature widening is
on internal mailer functions), no new entity, no schema change.

## Personas *(mandatory — constitution v1.4.0)*

Carried from prior specs; narrowed to the three personas this feature
actually serves.

- **P1 — Standa, 67 · Stock manager**: Basic, small old Android, large fingers, reading glasses, **Czech only**. He signs in at the Czech form and expects to find a Czech email in his inbox. The current English email confuses him and may cost him the magic-link window while he double-checks whether it's the right one. He is the persona this feature serves first.
- **P3 — Tereza, 34 · Member**: iPhone, fluent in both languages. She'll cope with either-language emails, but when she invites her friend Klára (Czech only) via the admin UI, she wants the invitation email Klára receives to be in Czech — because Klára won't open an English email from a sender she doesn't recognize.
- **P5 — Pavel, 45 · Club admin**: Sets the club up, invites the founding members. He invites in Czech (the club's working language). Every invitation he sends today goes out in English, which contradicts the rest of the club's branding and onboarding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Magic-link email matches the sign-in locale (Priority: P1)

When a member submits the sign-in form, the magic-link email they
receive is in the same language as the form they just used: Czech for
a request made from a `cs`-locale form, English for an `en` one. The
subject line and the body match (no half-translated emails).

**Why this priority**: This is the persona-blocker. Standa cannot
finish the sign-in flow if the email doesn't read in Czech — he won't
recognize it as the one he requested. Solving US1 alone is already a
shippable improvement.

**Independent Test**: Submit the sign-in form from `/cs/sign-in`;
inspect the Mailpit inbox (http://localhost:18025); the magic-link
email body + subject are in Czech. Repeat from `/en/sign-in`; the
email is in English. The link inside the email still works (the URL
is locale-agnostic — Better Auth's verification callback is not
changed).

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **P1 (Standa, Czech)** — **Given** he submits his email at `/cs/sign-in`, **When** the magic-link is dispatched, **Then** the email body and subject he receives are in Czech (matching the locale his browser/cookie indicated to the form).
2. **P3 (Tereza, English UI)** — **Given** she has switched the app to English and submits at `/en/sign-in`, **When** the magic-link is dispatched, **Then** the email is in English.
3. **Anyone** — **Given** the locale of the request cannot be determined (programmatic re-send, callback runs without a clean request context), **When** the magic-link is dispatched, **Then** the email falls back to `routing.defaultLocale` (`cs`) and the send still succeeds.

---

### User Story 2 — Invitation email matches the inviter's locale (Priority: P2)

When an admin sends an invitation from the admin UI, the invitation
email is rendered in the locale the admin is currently using. The
assumption is that admin and invitee belong to the same closed club
and share a working language — for the v1 single-club product shape
this holds in essentially every realistic deployment.

**Why this priority**: P2 because US1 unblocks the persona; US2 makes
the system consistent end-to-end. Sending an English invitation to a
Czech invitee is awkward (Pavel's reputation as the club admin
suffers, Klára won't open it) but not flow-blocking once the
invitation is opened — the in-app acceptance page is already
localized via the URL prefix.

**Independent Test**: As a `cs`-locale admin, send an invitation from
`/cs/admin/members`; the recipient's Mailpit inbox shows a Czech
email. Switch to `en`, send another invitation; English email. The
acceptInvitation flow (the recipient clicking the link, landing at
`/invitation/[token]`, completing setup) is **not** changed by this
feature.

**Acceptance Scenarios**:

1. **P5 (Pavel, Czech admin)** — **Given** he is on `/cs/admin/members`, **When** he invites a new member, **Then** the invitation email subject + body are in Czech.
2. **P3 (Tereza, English admin)** — **Given** she has switched her admin session to English and invites someone, **When** the email is dispatched, **Then** it is in English.

---

### Edge Cases

- **Locale cannot be derived from request context.** Some Better Auth code paths and the `resendInvitation` action may run with an incomplete request context. The mailer's `locale` parameter is optional; when omitted or unrecognized, it falls back to `routing.defaultLocale` (`cs`). The send still succeeds — locale-resolution failure NEVER blocks the email.
- **Subject and body must share a locale.** A half-translated email is worse than an all-English one. Both come from the same `getTranslations({ locale, namespace: 'emails.…' })` instance — there is exactly one resolved locale per email send. Enforced by the implementation pattern (single `t` per template), not a runtime check.
- **Regionalized locale tags** (`cs-CZ`, `en-US`, etc.). The mailer accepts the bare `Locale` type from `lib/i18n/routing.ts` (`'cs' | 'en'`). Regionalized tags are normalized at the call site (from `await getLocale()`) before being passed in.
- **The seeded `SEED_CLUB_LOCALE=cs-CZ`** sets the club's `defaultLocale` to Czech. v1.6 does NOT route invitation locale through `clubs.defaultLocale` — that's a richer model (admin-from-Berlin invites Czech-speaking-Pavel: which locale wins?) deliberately deferred. See Out of Scope below.
- **i18n parity gate.** All new copy strings (subject lines, headlines, bodies, signoffs) ship in `cs` and `en` from day one. `pnpm i18n:check` MUST pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The two React Email templates (`emails/MagicLinkEmail.tsx`, `emails/InvitationEmail.tsx`) MUST render all user-facing copy from the `messages/{cs,en}.json` catalogs under a new top-level namespace `emails.*`. No string literals remain in the templates except React Email infrastructure tags (`<Html>`, `<Body>`, etc.) and the dynamic data props (`url`, `inviterName`, `clubName`).
- **FR-002**: The templates MUST stay **pure presentation components** — they receive already-resolved strings as props. Localization happens in the mailer (the strings are pre-resolved with `getTranslations({ locale })` and handed to the component). Rationale: React Email components render in a context that cannot rely on `useTranslations` (no React tree / next-intl provider).
- **FR-003**: `lib/email/mailer.ts` `sendMagicLink` and `sendInvitation` MUST accept an optional `locale: Locale` parameter (re-exported from `lib/i18n/routing.ts`, type `'cs' | 'en'`). An omitted or unrecognized locale falls back to `routing.defaultLocale`.
- **FR-004**: Email subject AND body MUST share the same resolved locale. The mailer derives both from the single `getTranslations({ locale, namespace: 'emails.magicLink' })` (or `…invitation`) instance per send.
- **FR-005**: The magic-link send path MUST read the locale from request context and thread it to the mailer. Specifically: Better Auth's `sendMagicLink` callback in `lib/auth/better-auth.ts` calls `await getLocale()` (from `next-intl/server`) and passes the result to `sendMagicLink`. The callback runs inside `requestMagicLinkAction`'s request context, so `getLocale()` resolves correctly.
- **FR-006**: The invitation send path MUST do the same. The admin `createInvitation` action (in `app/[locale]/(app)/admin/members/actions.ts`) calls `await getLocale()` and passes it to `sendInvitation`. The `resendInvitation` action (when called) does the same.
- **FR-007**: `pnpm i18n:check` MUST pass — every new key exists in both catalogs.
- **FR-008**: Locale resolution MUST NOT throw or block the email send on failure. If `getLocale()` raises (some future caller outside a request context), the mailer falls back to `routing.defaultLocale` and logs a warning. The send-best-effort guarantee at `lib/email/mailer.ts:42` ("a failed send must never break the surrounding flow") extends to locale-resolution failures.

### Key Entities

None. This feature changes presentation (email templates), infrastructure (mailer signature, two call sites), and i18n catalogs. No schema change, no new column, no new table.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user submitting `/cs/sign-in` receives a Czech magic-link email (subject in Czech, body in Czech). A user submitting `/en/sign-in` receives an English email. Verified by hand against Mailpit at `http://localhost:18025`.
- **SC-002**: An admin on `/cs/admin/members` who invites a new member dispatches a Czech invitation email; an English-locale admin dispatches an English one. Same verification path.
- **SC-003**: The seven verification gates (`typecheck`, `lint`, `test:unit`, `i18n:check`, `forms:check`, `build`, `playwright test`) all pass after the change. The existing magic-link and invitation E2E coverage continues to pass (the URL inside the email is locale-agnostic, so the click-and-verify flow does not change).
- **SC-004**: Zero new npm dependencies. `next-intl`'s `getTranslations({ locale })` API is already in the dependency tree.

## Assumptions

- **Single-locale send per email.** v1.6 does not send bilingual emails (Czech + English in one body). The product is mobile-first / single-club, and bilingual emails are a heavier UX choice with their own trade-offs (length, visual hierarchy, ambiguity about which to read).
- **Invitation locale follows the inviter, not the club's `defaultLocale`.** For the v1 single-club shape this collapses to the same answer in essentially every deployment (the admin and the invitees share a working language). Routing invitation locale through `clubs.defaultLocale` is a richer model worth doing if/when multi-club or cross-language admins appear; deliberately deferred.
- **No new E2E.** The existing `tests/e2e/auth.spec.ts` and invitation E2E coverage continue to be the regression net. A new E2E that asserts the email body language is **out of scope** for v1.6 — the assertion would need to scrape Mailpit's HTTP API (new test dependency surface) or assume a production email provider. Manual verification via Mailpit at T-final is the assertion of record.
- **No public-API impact.** Better Auth's external interface (`/api/auth/[...all]`) is unchanged. The only signature widening is on internal mailer functions; action contracts are unchanged.

## Out of Scope

- Localizing email **content** to a per-recipient preference stored on the user/member row. v1.6 routes by request context only; per-user persistence is a v1.7 concern.
- Bilingual emails (sending both Czech and English in one body).
- Routing invitation locale through `clubs.defaultLocale` (see Assumption 2).
- Localizing other not-yet-existing emails (password-reset, statement, receipts) — beeromat has no such flows.
- Adding a translator review pass. The Czech and English copy in v1.6 is authored during implementation and reviewed by the user — the same model the rest of the catalogs use.
