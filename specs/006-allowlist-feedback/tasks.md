---
description: "Task list for Allowlist Feedback & Sign-in Recovery (v1.5)"
---

# Tasks: Allowlist Feedback & Sign-in Recovery (v1.5)

**Input**: Design documents from `specs/006-allowlist-feedback/`

**Prerequisites**: plan.md, spec.md, contracts/auth.md

**Tests**: A targeted unit test on `requestMagicLinkAction`'s status
output is included (spec Assumption 3). No new E2E spec — the existing
sign-in E2E continues to assert the on-list path.

**Organization**: Tasks are grouped by user story. US1 (the
not-on-allowlist message) and the v1.0 contract supersession block US2
(the retry link), which depends on the form's new three-state structure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US2 maps the task to its spec user story

**Verifiable Tasks rule (constitution).** Every task is observable by a
gate (`typecheck`, `lint`, `test:unit`, `i18n:check`, `forms:check`,
`build`) or by manual exercise of the two screens.

## Path Conventions

Single Next.js App Router app at the repository root: `app/`,
`components/`, `messages/`, `lib/`, `tests/`.

---

## Phase 1: Setup

**Purpose**: None — v1.5 adds no dependency, no env var, no migration.
Proceed to US1.

---

## Phase 2: User Story 1 — Friendly "not on the allowlist" message (Priority: P1) 🎯 MVP

**Goal**: An unknown email produces a distinguishable client outcome
that renders as a dedicated screen explaining the situation and the
admin-resolution path.

**Independent Test**: Unit test on `requestMagicLinkAction` asserts the
three-way status output across the four input classes (sent /
not-on-list / rate-limited / Turnstile-failed). Manual: submitting an
unknown email from the form lands on the new screen.

**⚠️ BLOCKS US2** — US2's retry-from-not-on-list affordance needs the
new screen to exist first.

- [ ] T001 [US1] Annotate `specs/001-beer-consumption-ledger/contracts/auth.md` § `requestMagicLink` with a single-line **superseded by** banner pointing at `specs/006-allowlist-feedback/contracts/auth.md`. Do not delete or rewrite the v1.0 contract — it remains the source of truth for everything in that file *except* the one superseded section.
- [ ] T002 [US1] In `lib/auth/actions.ts`, widen the `AuthActionResult` discriminator for `requestMagicLinkAction` to return `{ ok: true; status: 'sent' | 'not-on-allowlist' | 'rate-limited' }`. Map the existing branches per `specs/006-allowlist-feedback/contracts/auth.md`: malformed-email / Turnstile-failed / rate-limited → `rate-limited`; allowlist miss → `not-on-allowlist`; allowlist hit (regardless of SMTP success) → `sent`. Replace the doc-comment's `Per contracts/auth.md:` line with `Per spec 006 contracts/auth.md (supersedes spec 001):`.
- [ ] T003 [P] [US1] Add new i18n keys under `auth.signIn` in both `messages/cs.json` and `messages/en.json`: `notOnListHeadline`, `notOnListBody`, `notOnListAdminCta`. Czech and English copy are written to match the spec's tone requirement (FR-003 — friendly, light, names the resolution).
- [ ] T004 [US1] In `app/[locale]/(auth)/sign-in/SignInForm.tsx`, replace the boolean `sent` state with a `result` state of shape `null | { status: 'sent' | 'not-on-allowlist' | 'rate-limited' }`. Wire the action's new status into it. Render a third presentation state for `not-on-allowlist` (headline + body + admin-CTA, mirrors the layout of the `sent` screen). The `rate-limited` status renders the same "Link sent" screen as `sent` (FR-002 — client cannot distinguish).
- [ ] T005 [US1] Unit test `tests/unit/request-magic-link.spec.ts`: assert all four status mappings (sent for an allowlisted email, not-on-allowlist for an unknown one, rate-limited for malformed input, rate-limited for an over-quota call). Use PGlite + the existing test scaffolding pattern from `tests/unit/balance.spec.ts`.

**Checkpoint**: After T001–T005, US1 is complete and shippable. The
not-on-allowlist screen renders; the on-list flow is unchanged; the
contract supersession is documented; `pnpm test:unit` and
`pnpm i18n:check` pass.

---

## Phase 3: User Story 2 — Use-a-different-email retry link (Priority: P2)

**Goal**: From both terminal screens (`sent` and `not-on-allowlist`),
the user can tap a "Use a different email" link to return to a fresh,
re-armed form.

**Independent Test**: Manual — reach each terminal screen, click the
link, see the empty form re-render with email-field focus and a fresh
Turnstile widget; submit again to confirm the round-trip works.

- [ ] T006 [P] [US2] Add new i18n key `auth.signIn.useDifferentEmail` in both `messages/cs.json` and `messages/en.json`.
- [ ] T007 [US2] In `SignInForm.tsx`, add a "Use a different email" button on both the `sent` and `not-on-allowlist` screens. Clicking it resets the `result` state to `null`, clears the form's email field, resets the Turnstile token state to `null` (forces the widget to re-arm), and focuses the email input. Use a styled `<button type="button">` consistent with the existing forgot-PIN link pattern in `pin-gate.tsx` (the muted-foreground underline style).

**Checkpoint**: After T006–T007, US2 is complete. Both terminal screens
have a working retry affordance.

---

## Phase 4: Polish & ship

- [ ] T008 Run the seven verification gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm i18n:check`, `pnpm forms:check`, `pnpm build`, `pnpm test:e2e`. All must pass. The existing sign-in E2E continues to assert the on-list flow — that is the regression net for the contract change.
- [ ] T009 Manually exercise the two terminal screens at `http://localhost:3010/sign-in` using `admin@example.test` (allowlisted, expect `sent`) and a deliberately unknown email like `nobody@example.test` (expect `not-on-allowlist`). Verify the retry link works from both.
- [ ] T010 Mark `specs/006-allowlist-feedback/spec.md` Status: `Shipped`. Merge `006-allowlist-feedback` into `main` with a merge commit. Push both branches.
