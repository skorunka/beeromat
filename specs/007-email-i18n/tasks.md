---
description: "Task list for Localized transactional emails (v1.6)"
---

# Tasks: Localized transactional emails (v1.6)

**Input**: Design documents from `specs/007-email-i18n/`

**Prerequisites**: plan.md, spec.md

**Tests**: No new automated tests in v1.6 (per spec Assumption 3 —
asserting email body language needs Mailpit-HTTP-API access, deferred).
Manual verification via Mailpit at T010 is the assertion of record.

**Organization**: Tasks are grouped by user story. US1 (magic-link
i18n — the persona blocker) ships first; US2 (invitation i18n)
follows the same pattern for the second email.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US2 maps the task to its spec user story

**Verifiable Tasks rule (constitution).** Every task is observable by
a gate (`typecheck`, `lint`, `i18n:check`, `forms:check`, `build`) or
by manual exercise of the email content in Mailpit.

## Path Conventions

Single Next.js App Router app at the repository root: `app/`,
`components/`, `emails/`, `lib/`, `messages/`.

---

## Phase 1: Setup

**Purpose**: None — v1.6 adds no dependency, no env var, no migration.
`next-intl`'s `getTranslations({ locale })` is already in the
dependency tree. Proceed to US1.

---

## Phase 2: User Story 1 — Magic-link email matches the sign-in locale (Priority: P1) 🎯 MVP

**Goal**: A Czech sign-in request produces a Czech magic-link email;
English produces English. Subject + body share the same locale.

**Independent Test**: Submit `/cs/sign-in` for a seeded allowlisted
member; the email in Mailpit (http://localhost:18025) is in Czech.
Repeat at `/en/sign-in`; the email is in English. Existing
`tests/e2e/auth.spec.ts` (the on-list happy path) still passes — the
URL inside the email is unchanged.

- [X] T001 [US1] Add the `emails.magicLink.*` namespace to both `messages/cs.json` and `messages/en.json`. Keys: `subject`, `previewText`, `heading`, `bodyParagraph`, `buttonLabel`, `fallbackLinkLabel`, `signoffParagraph`. Czech and English copy is short, warm, mate-to-mate (matches the rest of the catalog tone); subject line stays clearly identifiable as a beeromat email.
- [X] T002 [US1] Refactor `emails/MagicLinkEmail.tsx` into a **pure-prop component**: it receives `{ url, t: { previewText, heading, bodyParagraph, buttonLabel, fallbackLinkLabel, signoffParagraph } }` (or equivalent flat string props) and renders them. No `useTranslations`, no `t()` inside. Update `MagicLinkEmail.PreviewProps` to provide the strings (so `pnpm email` / React Email preview still works in isolation). Keep React Email infrastructure tags + the `url` prop.
- [X] T003 [US1] In `lib/email/mailer.ts`: widen `sendMagicLink` signature to `({ to, url, locale }: { to: string; url: string; locale?: Locale })`. Import `Locale` from `lib/i18n/routing.ts`. Inside, call `await getTranslations({ locale: locale ?? routing.defaultLocale, namespace: 'emails.magicLink' })` to get a `t` instance. Compute `subject = t('subject')` and pre-resolve all body strings, pass to `MagicLinkEmail({ url, ...strings })`. The `getTranslations` call is wrapped in a try/catch that logs and falls back to `routing.defaultLocale` if it throws (FR-008).
- [X] T004 [US1] In `lib/auth/better-auth.ts`: import `getLocale` from `next-intl/server`. Inside the `sendMagicLink` callback registered with the magic-link plugin, resolve `const locale = await getLocale().catch(() => undefined)` and pass it to `sendMagicLink({ to: email, url, locale })`. The `.catch(() => undefined)` is the defensive seatbelt — if the callback ever runs outside a request context, the mailer's own fallback (T003) kicks in.

**Checkpoint**: After T001–T004, US1 is complete and shippable.
Manual exercise: sign in at `/cs/sign-in` with `admin@example.test`,
open Mailpit at http://localhost:18025, confirm Czech email. Same at
`/en/sign-in`. `pnpm i18n:check`, `pnpm typecheck`, `pnpm lint` pass.

---

## Phase 3: User Story 2 — Invitation email matches the inviter's locale (Priority: P2)

**Goal**: Same pattern for the invitation email — locale follows
the admin who clicks "Send invite".

**Independent Test**: As a `cs`-locale admin (admin@example.test
logged in via `/cs/...`), send an invitation to a new email; the
recipient's Mailpit inbox shows a Czech email. Switch to `en`, send
another; English email.

- [X] T005 [US2] Add the `emails.invitation.*` namespace to both `messages/cs.json` and `messages/en.json`. Keys: `subject`, `previewText`, `heading`, `bodyIntro`, `bodyPitch`, `buttonLabel`, `fallbackLinkLabel`, `expiryNote`, `ignoreNote`. The `subject` and `heading` interpolate `{inviterName}` and `{clubName}` — copy is parametric, not pre-rendered. Czech and English copy matches the warm mate-to-mate tone.
- [X] T006 [US2] Refactor `emails/InvitationEmail.tsx` into a pure-prop component the same way as T002: receives `{ inviterName, clubName, url, t: { previewText, heading, bodyIntro, bodyPitch, buttonLabel, fallbackLinkLabel, expiryNote, ignoreNote } }` (with `{inviterName}` / `{clubName}` already interpolated into the strings — the mailer does the interpolation via `t('heading', { inviterName, clubName })`). Update `InvitationEmail.PreviewProps`.
- [X] T007 [US2] In `lib/email/mailer.ts`: widen `sendInvitation` signature to add `locale?: Locale`. Pattern mirrors T003: `getTranslations({ locale, namespace: 'emails.invitation' })`, pre-resolve all strings (passing `{ inviterName, clubName }` to interpolating keys), hand to the template.
- [X] T008 [US2] In `app/[locale]/(app)/admin/members/actions.ts`: in the `createInvitation` action (and `resendInvitation` if it also dispatches an email), add `const locale = await getLocale().catch(() => undefined)` and pass to `sendInvitation({ ..., locale })`.

**Checkpoint**: After T005–T008, US2 is complete and shippable. The
two-email i18n surface is fully closed.

---

## Phase 4: Polish & ship

- [ ] T009 [US1+US2] New E2E spec `tests/e2e/email-i18n.spec.ts` — the regression net for SC-001 and SC-002 (added per `/speckit-analyze` finding C1: Verification Gate 5 was being skipped without a `Skipped-Gate:` plan). Four test cases. For each: (a) issue the action that dispatches the email (programmatically — `requestMagicLinkAction` for magic-link, `createInvitation` for invitation), passing the locale via the request context; (b) poll Mailpit's HTTP API at `http://localhost:18025/api/v1/messages?query=to:<recipient>` until the dispatched message appears (max 5s); (c) fetch the full message via `/api/v1/message/{id}`; (d) **assert the email's `Subject` header equals the value at `messages/<locale>.json` → `emails.<template>.subject`** (loaded at test time via `import cs from '@/messages/cs.json'`). This tests the **wiring** (locale → catalog key → email subject), not the copy itself. Cases: magic-link cs, magic-link en, invitation cs, invitation en. Add `query: 'to:...'` to the Mailpit API call so each case is isolated from the others.
- [ ] T010 Run the seven verification gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm i18n:check`, `pnpm forms:check`, `pnpm build`, then `npx playwright test tests/e2e/auth.spec.ts tests/e2e/email-i18n.spec.ts` (the existing magic-link on-list regression net plus the new email-i18n spec from T009). All must pass.
- [ ] T011 Manual visual exercise via Mailpit at `http://localhost:18025` — discharges the Acceptance Scenarios under US1 (#1 P1 Standa Czech, #2 P3 Tereza English) and US2 (#1 P5 Pavel Czech, #2 P3 Tereza English). T009 covers the wiring; this case covers what an automated test can't: copy quality and visual layout. For each of the four cases (a-d below), verify: (i) all visible text — subject, headline, body, button label, signoff — reads as natural language in the expected locale; (ii) no English text leaks into the Czech email and no Czech text leaks into the English email; (iii) the URL/button inside the email is clickable and reaches a working app screen. Cases: (a) sign in at `/cs/sign-in` with `admin@example.test`; (b) switch app to `en` via the locale picker → sign in again; (c) as the signed-in admin on `/cs/admin/members`, invite `test-cs@example.test`; (d) switch to `/en/admin/members` → invite `test-en@example.test`.
- [ ] T012 Mark `specs/007-email-i18n/spec.md` Status: `Shipped`. Merge `007-email-i18n` into `main` with a merge commit. Push both branches.
