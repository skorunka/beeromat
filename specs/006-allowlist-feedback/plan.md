# Implementation Plan: Allowlist Feedback & Sign-in Recovery (v1.5)

**Branch**: `006-allowlist-feedback` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-allowlist-feedback/spec.md`

## Summary

v1.5 makes the sign-in flow legible at its two cliff edges: an unknown
email no longer gets the same "Link sent" answer as a known one, and
both the link-sent and the new not-on-allowlist confirmation screens
gain a "Use a different email" affordance back to the form.

The change is **presentation + one narrow contract change**:

1. `requestMagicLinkAction` returns a three-way `status` discriminator
   (`sent` | `not-on-allowlist` | `rate-limited`) instead of the v1.0
   uniform `{ ok: true }`. The `rate-limited` bucket preserves the v1.0
   silent-absorb behaviour for the request classes that DO carry
   enumeration-adversary value (rate limit engaged, Turnstile failed).
2. `SignInForm` adds a third presentation state and a retry affordance
   on the two terminal screens.
3. Two new i18n keys land in `cs.json` and `en.json`.

No schema change, no new entity, no new dependency, no new gate. The
seven existing verification gates remain the bar.

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router), React 19.2, next-intl
4, Better Auth, Drizzle ORM, `react-hook-form` + `@hookform/resolvers` +
`zod` (the v1.2 form layer). **No new dependency**.

**Storage**: Neon Postgres via Drizzle — **untouched**. No tables,
columns, migrations.

**Testing**: Vitest + PGlite (unit) for the new
`requestMagicLinkAction` status output. The existing Playwright
sign-in E2E coverage continues to assert the on-list path; a new E2E
for the not-on-allowlist path is **out of scope** for v1.5 (per the
spec's Assumption 3) — the unit test on the action is the assertion of
record, plus a manual exercise of the two screens.

**Target Platform**: mobile-first / mobile-only installable PWA;
baseline phone 360×640.

**Performance Goals**: SC-001 — the not-on-allowlist response stays in
the same p95 budget as the on-list response (the additional cost is a
single `members` + `invitations` lookup that already happens today on
every magic-link request).

**Constraints**: contracts/auth.md (v1.0 → supersession by this spec)
MUST be annotated, never deleted; the i18n parity gate
(`pnpm i18n:check`) MUST pass; the constitution v1.6.0 Auth principle
("Auth that disappears, bots bounce") is honoured because Turnstile +
rate limiting + magic-link expiry all remain on the unknown-email path.

**Project Type**: Web application (single Next.js app, App Router).

**Scale/Scope**: 1 server action signature change, 1 form component
state addition, 2 new i18n keys per locale, 1 new contract document,
1 supersession annotation on the v1.0 contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.6.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Honored | Two screens get a tap-target retry link; layouts unchanged. |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched. |
| IV. Auth that disappears, bots bounce | ⚠️ Trade documented | Turnstile + rate-limit + magic-link expiry retained. The privacy-by-default reply shape is narrowed to the rate-limited/Turnstile-failed path (where it carries adversary value) and dropped on the not-on-allowlist path (where it does not). Spec §Security Requirements documents the threat model. |
| V. Auditable history — incl. UI-reversibility | ✅ Unaffected | No domain rows; the sign-in flow leaves no audit-relevant trail. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure. |
| i18n section (catalog, `Intl.*`) | ✅ Honored | Both new strings ship in `cs` + `en`; `i18n:check` covers them. |
| Forms standard (v1.6.0 — `forms:check`) | ✅ Unaffected | No form-schema change; the existing `signInSchema` is intact. |

**Notable**: the v1.5 supersession is narrowly scoped. It does NOT
relax the rate-limit-bucket reply (an attacker still can't tell whether
they've been rate-limited or whether their Turnstile failed). The
constitution amendment threshold (a new MUST / MUST NOT principle) is
not reached; a per-spec contract supersession is the right granularity.

## Phase 0 / 1

**Phase 0 (research)**: None — every decision is in scope of the
current codebase and the spec's threat model. No third-party docs
consulted. No alternatives compared (the only architectural choice was
spec-vs-no-spec, settled by the user choosing path (a)).

**Phase 1 (design)**: Three artifacts:

- This `plan.md` — overall scope + Constitution Check.
- `contracts/auth.md` — the new `requestMagicLinkAction` contract (the
  bit that supersedes the v1.0 contract).
- `tasks.md` — the implementation breakdown.

Nothing about this feature needs a `data-model.md` (no entities) or a
`research.md` (no comparative investigation). Skipping per Phase 0
guidance — these artifacts MAY be omitted when they would be empty.
