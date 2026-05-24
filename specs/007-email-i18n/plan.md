# Implementation Plan: Localized transactional emails (v1.6)

**Branch**: `007-email-i18n` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-email-i18n/spec.md`

## Summary

v1.6 makes the two transactional emails (magic-link + invitation)
match the locale of the user who triggered them. Today the templates
are hardcoded English literals — `pnpm i18n:check` doesn't even look
at them because they don't go through `t()`. v1.6 pulls them under
the existing `messages/{cs,en}.json` catalog discipline (a new
`emails.*` namespace) and threads the locale through three places:

1. The two **React Email templates** (`MagicLinkEmail.tsx`,
   `InvitationEmail.tsx`) become **pure presentation components** —
   they receive already-resolved strings as props. This is the only
   architecturally-novel decision: React Email components can't call
   `useTranslations` (no React tree / next-intl provider context at
   render time). Resolving the strings in the mailer keeps the
   templates dumb.
2. The **mailer** (`lib/email/mailer.ts`) takes an optional
   `locale: Locale` parameter on both `sendMagicLink` and
   `sendInvitation`. It calls `getTranslations({ locale, namespace })`
   once per send, computes the subject + body strings, and passes
   them as props to the template.
3. The **two call sites** read `await getLocale()` from
   `next-intl/server` and pass it to the mailer:
   - `lib/auth/better-auth.ts` — the `sendMagicLink` callback the
     magic-link plugin invokes. It runs inside
     `requestMagicLinkAction`'s request context, so `getLocale()`
     resolves the right value.
   - `app/[locale]/(app)/admin/members/actions.ts` — the
     `createInvitation` and `resendInvitation` actions, both invoked
     from a locale-aware admin route.

Zero new dependency, zero schema change, zero public-action contract
change. The mailer's signature widens (optional param), which is
backwards-compatible for any caller that doesn't pass it (falls back
to `routing.defaultLocale`).

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router), React 19.2,
`next-intl` 4 (already provides `getTranslations({ locale })` for
out-of-React-tree string resolution), `@react-email/components` 0.5,
`@react-email/render` 1.4, `nodemailer` 8. **No new dependency**.

**Storage**: Neon Postgres via Drizzle — **untouched**.

**Testing**: Vitest (existing); Playwright (existing) — no new
specs. The existing `tests/e2e/auth.spec.ts` covers the magic-link
flow end-to-end; it does NOT assert email body language and will not
in v1.6 (per spec Assumption 3 — adding a Mailpit-HTTP-API assertion
is its own test-infrastructure decision deferred to a later spec).

**Target Platform**: server-side rendering of emails (Node runtime);
the rendered HTML is delivered to Mailpit locally and Resend in
production. The recipient's email client renders the HTML — no
client-side i18n concern.

**Performance Goals**: Email send latency is dominated by SMTP and
`@react-email/render`. Adding a `getTranslations({ locale })` call
adds <5ms (catalog load is cached). No measurable budget impact.

**Constraints**:
- `pnpm i18n:check` MUST pass — every new key in both `cs` and `en`.
- Send-best-effort guarantee (mailer never throws, always logs) extends to locale-resolution failures.
- React Email templates are pure presentation — no `useTranslations`, no `t()` inside the component body. The component receives finished strings as props.

**Project Type**: Web application (single Next.js app, App Router).

**Scale/Scope**: 2 React Email templates rewritten as pure-prop
components; 1 mailer file widens 2 function signatures; 2 call
sites add `await getLocale()` + a parameter; 2 message catalogs add
a new top-level `emails` namespace with ~12 keys per locale (subject
+ headlines + body paragraphs + button labels + signoffs × 2
templates).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.6.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Unaffected | No app-screen change. Emails are read in third-party clients. |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched. |
| IV. Auth that disappears, bots bounce | ✅ Honored | Better Auth flow unchanged; the callback wiring only adds a locale read. Turnstile, rate-limit, magic-link expiry untouched. |
| V. Auditable history — incl. UI-reversibility | ✅ Unaffected | No domain rows. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure or paid service. |
| i18n section (catalog, `Intl.*`) | ✅ Directly advances it | Closes the last surface where hardcoded English literals lived. The i18n parity gate now genuinely covers user-facing copy end-to-end. |
| Forms standard (`forms:check`) | ✅ Unaffected | No form-schema change. |
| Local-dev infra (non-default ports, etc.) | ✅ Unaffected | Mailpit unchanged. |

## Phase 0 / 1

**Phase 0 (research)**: None. Every decision is in scope of the
current codebase and the spec's threat model. The only "novel" choice
is how React Email components consume translations (pure-prop pattern
documented in the spec's FR-002).

**Phase 1 (design)**: Two artifacts:

- This `plan.md` — overall scope + Constitution Check.
- `tasks.md` — the implementation breakdown.

Nothing about this feature needs a `data-model.md`, a `research.md`,
or a `contracts/` directory — no entities, no comparative
investigation, no public-contract change. The mailer's internal
signature widening is documented inline in the file as part of the
implementation.
