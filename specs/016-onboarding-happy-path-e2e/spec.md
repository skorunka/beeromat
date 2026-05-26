# Feature Specification: Onboarding Happy-Path E2E (v1.10)

**Feature Branch**: `016-onboarding-happy-path-e2e` (direct-to-main, trunk-based)

**Created**: 2026-05-26

**Status**: Shipped (2026-05-26)

**Input**: User description: "now lets add the happy path e2e for the most critical journey" — onboarding (fresh install).

This is the first feature spec under Constitution v1.9.0's revised
Principle VIII. Playwright was removed from the repo on 2026-05-26
along with the spec-015 four-layer testing-pyramid attempt; v1.9.0
declared that E2E returns scoped per spec, starting with the most
critical happy-path. The user picked onboarding (fresh install) as
that first journey on the grounds that if it breaks, no deployment
ever reaches a working state and nothing else matters.

## Personas

- **P5 — Pavel, 45 · Fresh-install club admin** (same persona as
  spec 009 US1). The journey under test is exactly what Pavel does
  the first time he opens a freshly deployed beeromat URL. If this
  test goes red, Pavel cannot use the product at all.

## User Scenarios & Testing

### User Story 1 — Onboarding happy path is verified end-to-end (Priority: P1)

A freshly deployed beeromat with zero `clubs` and zero `users` MUST
let the first visitor bootstrap a working club through the browser
alone:

1. Visit `/` (or any path) → redirected to `/setup`.
2. Fill in club name, currency code, default locale, admin email.
3. Submit → land on `/sign-in?bootstrap-sent=1` with a "link sent"
   confirmation.
4. Database state after submit: exactly one `clubs` row with the
   submitted name + currency + locale; exactly one
   `club_banking_profiles` row keyed to that club; exactly one
   `users` row with the submitted email and `emailVerified = false`;
   exactly one Better Auth `verification` row carrying the magic-link
   token.

The magic-link click and the subsequent `session.create.after`
auto-promotion to `club_admin` are out of scope for v1 of this
spec — they are Better Auth's own well-tested code path and the
spec-008 hook's PGlite-unit-tested code path respectively. v2 of
this spec MAY extend the happy path to include the click +
promotion + landing on home.

**Acceptance criteria (gated by the new Playwright test):**

- Visiting `/` on a fresh DB lands on `/{locale}/setup`.
- The four form fields accept the test values and submit succeeds.
- The redirect target is `/sign-in?bootstrap-sent=1`.
- DB state matches the four-row invariant above.

### Out of scope

- Magic-link verification + auto-promotion (v2 of this spec).
- US2 (`/setup` invisibility post-bootstrap) — already covered by
  spec 009's unit tests for `isFreshDeployment`.
- Multi-test E2E expansion. This spec adds **one** test file, one
  test case. Per Principle VIII, each E2E test is brought back
  individually with its own spec.

## Success Criteria

- A `pnpm test:e2e` invocation completes with the one new
  happy-path test passing, in under 3 minutes including the
  cold-build webserver startup.
- The Playwright stack added by this spec is self-contained:
  one `playwright.config.ts`, one fixtures helper, one spec file.
  No globalSetup / no project dependency chain / no `authedTest`
  fixture (single test does its own DB reset).
- Verification gate 8 (`pnpm test:e2e`) becomes active on the
  always-on list whenever this spec's journey is in scope; the
  conditional language in the constitution applies to *future*
  specs that haven't declared E2E coverage.
