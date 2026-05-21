# Tasks: UX Hardening (v1.1)

**Feature**: `002-ux-hardening` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tests**: Playwright E2E is mandatory per the constitution (gate 5) — every
Acceptance Scenario gets a matching assertion. Each E2E task is listed within
its user story's phase.

**Organization**: Tasks are grouped by user story. v1.1 edits the existing v1
Next.js app in place — most tasks modify existing files; new files are called
out explicitly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US8 per spec.md
- Verifiable Tasks rule (constitution v1.4.0): every task below is observable
  by a gate or an E2E assertion.

## Path Conventions

Existing Next.js App Router app at repo root: `app/[locale]/`, `components/`,
`messages/`, `lib/`, `scripts/`, `tests/e2e/`.

---

## Phase 1: Setup

- [X] T001 Restructure `messages/cs.json` and `messages/en.json` into screen-namespaced sections (`common`, `nav`, `auth`, `pin`, `home`, `log`, `tab`, `settle`, `treasurer`, `bet`, `history`, `admin`, `errors`) — establish the shared namespace skeleton both catalogs will fill.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Verification infrastructure — constitution v1.4.0. Must complete before user-story verification.**

- [X] T002 Implement the `i18n:check` gate in `scripts/i18n-check.ts` per contract C1 / research R1: (a) flatten and diff the `cs.json`/`en.json` key sets; (b) scan `app/**` and `components/**` `.tsx` for hardcoded user-facing literals (JSX text nodes; `placeholder`/`aria-label`/`alt`/`title` attributes; `toast.*` arguments); exit non-zero with `file:line` for each finding. (`package.json` already maps `pnpm i18n:check`.)
- [X] T003 [P] Add `tests/e2e/fixtures/viewport.ts` — a 360×640 viewport helper and a control-size assertion (rendered bounding box ≥ 44×44 px) for the US2 and US3 specs.

---

## Phase 3: User Story 1 - The app speaks the member's language (Priority: P1) 🎯 MVP

**Goal**: The entire UI renders in Czech or English from the catalog; the `i18n:check` gate passes.

**Independent Test**: Set locale `cs`, visit every screen — no English leaks; repeat for `en`; `cs`/`en` key sets match.

- [X] T004 [P] [US1] Author the `common`, `nav`, `errors` namespaces in `messages/cs.json` and `messages/en.json` (shared labels, buttons, generic errors).
- [X] T005 [P] [US1] Localize the home screen `app/[locale]/(app)/page.tsx`, `app/[locale]/(app)/layout.tsx`, and `components/dispute-banner.tsx`.
- [X] T006 [P] [US1] Localize `app/[locale]/(app)/log/page.tsx`, `app/[locale]/(app)/tab/page.tsx`, and `components/log/*`.
- [X] T007 [P] [US1] Localize `app/[locale]/(app)/settle/page.tsx` and `components/settle/*`.
- [X] T008 [P] [US1] Localize `app/[locale]/(app)/admin/pending/page.tsx`, `app/[locale]/(app)/admin/balances/` (list + `[memberId]`), and `components/treasurer/*`.
- [X] T009 [P] [US1] Localize `app/[locale]/(app)/bet/page.tsx` and `components/bet/*`.
- [ ] T010 [P] [US1] Localize `app/[locale]/(app)/history/` (list + `[sessionId]`).
- [ ] T011 [P] [US1] Localize `app/[locale]/(app)/admin/members/page.tsx`, `app/[locale]/(app)/admin/settings/banking/page.tsx`, `app/[locale]/(app)/admin/beer-types/` (list + `[id]/history`), and `components/admin/*`.
- [ ] T012 [P] [US1] Audit and complete localization of `app/[locale]/(auth)/*` and `components/pin/*` / `components/auth/*` (the auth/PIN catalog largely exists — close any gaps).
- [ ] T013 [US1] Run `pnpm i18n:check` and fix every catalog-parity and hardcoded-string failure until it exits zero (depends on T002 + T004–T012).
- [ ] T014 [US1] E2E `tests/e2e/ux-i18n.spec.ts` — assert representative screens render fully in `cs` and in `en` with no raw catalog keys (Acceptance Scenarios 1–2).

**Checkpoint**: UI fully bilingual; gate 6 green.

---

## Phase 4: User Story 2 - Every control is thumb-sized (Priority: P1)

**Goal**: Every primary action button ≥ 44×44 px at 360×640.

**Independent Test**: Measure action buttons at 360×640 — all ≥ 44px.

- [ ] T015 [US2] Audit `components/ui/button.tsx` size variants; raise the `sm` variant (or define an action size) so action buttons reach a ≥ 44px hit target without breaking icon/inline button forms.
- [ ] T016 [P] [US2] Apply the sizing across action buttons in `components/treasurer/pending-list.tsx`, `components/admin/beer-type-manager.tsx`, `components/bet/transfer-list.tsx`, and `components/settle/*` (replace `size="sm"` on action buttons).
- [ ] T017 [US2] E2E `tests/e2e/ux-touch-targets.spec.ts` — at 360×640, assert every action button ≥ 44×44 via the `viewport.ts` helper.

**Checkpoint**: No sub-44px action target remains.

---

## Phase 5: User Story 3 - Confirm and Dispute cannot be confused (Priority: P1)

**Goal**: The treasurer pending row reads clearly; Confirm and Dispute are mis-tap-safe.

**Independent Test**: At 360×640 a pending row shows amount/name prominently; the two actions are clearly separated.

- [X] T018 [US3] Restructure the pending-claim row in `components/treasurer/pending-list.tsx` per contract C5 — amount and member name as the dominant elements; `Confirm received` and `Dispute` on a dedicated line with a clear separating gap; no ambiguous wrap at 360px.
- [ ] T019 [US3] E2E `tests/e2e/ux-pending-row.spec.ts` — at 360×640, assert amount/name prominence and a measurable gap between Confirm and Dispute (Acceptance Scenarios 1–2).

**Checkpoint**: Pending row safe and legible on a small phone.

---

## Phase 6: User Story 4 - Undo a mistaken confirmation (Priority: P2)

**Goal**: A treasurer reverses a confirmed payment from the UI, with a reason.

**Independent Test**: Confirm a payment, undo it with a reason; balance restored; audit row written.

- [ ] T020 [US4] Add a `getRecentlyConfirmedPayments(clubId)` read query to `lib/db/queries/payments.ts` (reuses existing tables; no schema change).
- [ ] T021 [US4] Surface an "Undo confirmation" control (reason dialog → existing `voidConfirmedPaymentAction`) in `components/treasurer/pending-list.tsx` or a sibling component; offered ONLY for `confirmed` payments (contract C6, FR-008).
- [ ] T022 [US4] Render the recently-confirmed list on `app/[locale]/(app)/admin/pending/page.tsx`; add the new strings to the `treasurer` catalog namespace.
- [ ] T023 [US4] E2E `tests/e2e/ux-confirm-undo.spec.ts` — confirm then undo with a reason, assert balance restored and the action absent for a non-confirmed payment (Acceptance Scenarios 1–2).

**Checkpoint**: The confirm one-way door is closed (constitution Principle V).

---

## Phase 7: User Story 5 - Recover from a forgotten PIN (Priority: P2)

**Goal**: A "Forgot PIN" escape on the unlock screen, before lock-out.

**Independent Test**: From the unlock screen, forgot-PIN sends a sign-in link; no attempts spent.

- [ ] T024 [US5] Add a "Forgot PIN — email me a sign-in link" affordance to the `unlock` mode of `components/pin/pin-gate.tsx` — calls the existing `requestMagicLinkAction` for the signed-in user's email, shows a check-email confirmation, consumes no PIN attempts; add strings to the `pin` namespace.
- [ ] T025 [US5] E2E `tests/e2e/ux-forgot-pin.spec.ts` — from the unlock screen, forgot-PIN triggers a magic-link (verification row created) and spends no attempts (Acceptance Scenarios 1–2).

**Checkpoint**: The occasional user can no longer get trapped.

---

## Phase 8: User Story 7 - Get anywhere in one tap (Priority: P2)

**Goal**: A persistent bottom nav for daily flows; a single Admin hub.

**Independent Test**: Daily screens are one tap apart; the Admin hub lists members/banking/beer-types; role-gated entries hidden for plain members.

- [ ] T026 [P] [US7] Create `components/nav/bottom-nav.tsx` — fixed bottom navigation; daily destinations (Home, Log, Tab, Bet, History) plus role-gated entries (Treasurer, Stock, Admin) received as props; strings from the `nav` namespace.
- [ ] T027 [US7] Render the nav in `app/[locale]/(app)/layout.tsx` — compute role-visible entries server-side from the session; add bottom padding so content and the keyboard are not occluded (contract C3).
- [ ] T028 [P] [US7] Create the Admin hub `app/[locale]/(app)/admin/page.tsx` — links to members, banking profile, beer-types (contract C4); strings from the `admin` namespace.
- [ ] T029 [US7] Remove now-redundant ad-hoc navigation from `app/[locale]/(app)/page.tsx` (the Log/Tab/Bet/Settle/treasurer/stock link blocks) and the admin cross-links superseded by the hub + nav.
- [ ] T030 [US7] E2E `tests/e2e/ux-navigation.spec.ts` — daily screens reachable one tap apart; Admin hub lists the three areas; role-gated nav entries hidden for a plain member (Acceptance Scenarios 1–3).

**Checkpoint**: Navigation no longer routes through the home screen.

---

## Phase 9: User Story 6 - The bet screen always has a next step (Priority: P3)

**Goal**: The bet "no open session" state guides instead of dead-ending.

**Independent Test**: No session → guidance + log link; after logging, transfer list works.

- [X] T031 [US6] Replace the "No open session" dead end in `app/[locale]/(app)/bet/page.tsx` with guidance text ("a session starts when the first beer is logged") and a link to `/log` (contract C9); strings from the `bet` namespace.
- [ ] T032 [US6] E2E `tests/e2e/ux-bet-no-session.spec.ts` — with no open session the bet screen shows guidance + a log link; after a beer is logged the transferable list is available (Acceptance Scenarios 1–2).

**Checkpoint**: No dead end on the bet screen.

---

## Phase 10: User Story 8 - The app never looks frozen (Priority: P3)

**Goal**: Route navigation shows an immediate loading skeleton.

**Independent Test**: Under throttling, each navigation shows a placeholder within 300 ms.

- [ ] T033 [P] [US8] Add `app/[locale]/(app)/loading.tsx` — a shared skeleton for the authenticated group.
- [ ] T034 [P] [US8] Add content-shaped `loading.tsx` for `app/[locale]/(app)/admin/pending/`, `app/[locale]/(app)/admin/balances/`, and `app/[locale]/(app)/history/`.
- [ ] T035 [US8] E2E `tests/e2e/ux-loading.spec.ts` — assert a loading placeholder appears on navigation to a data-heavy route (Acceptance Scenario 1).

**Checkpoint**: Every transition gives feedback.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T036 Run all six verification gates — `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e`, `pnpm i18n:check` — all green.
- [ ] T037 Run the full Playwright suite and confirm the v1 specs (`us1-log-beer`, `us2-settle`, `us3-treasurer-confirm`, `us4-…`, `us5-…`, `us6-…`, `us7-…`, `us8-…`) still pass after the localization and navigation changes — fix any regression (e.g. selectors that relied on English text now needing locale-agnostic locators).
- [ ] T038 Merge `002-ux-hardening` to `main` and update the `project-implementation-progress` memory to record v1.1 shipped.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2)** → after Setup. T002 (the gate) blocks US1's T013.
- **User Stories (Phases 3–10)** → after Foundational. Stories are largely independent and may proceed in parallel; priority order is US1, US2, US3 (P1) → US4, US5, US7 (P2) → US6, US8 (P3).
- **Polish (Phase 11)** → after all targeted stories.

### Cross-story notes

- US1 (i18n) touches nearly every file; US3, US4, US7, US6 also edit screens. To
  avoid churn, **do US1 first** (it is the MVP and P0), then the others add
  their strings to the already-namespaced catalogs.
- US2's T015 (`button.tsx`) precedes T016 (call sites).
- US7's T026 (`bottom-nav.tsx`) precedes T027 (rendering it).

### Within-story parallel example (US1)

```
T005, T006, T007, T008, T009, T010, T011, T012  — all [P], different files
        ↓ (all complete)
T013  — i18n:check must see every screen done
        ↓
T014  — E2E
```

## Implementation Strategy

**MVP = User Story 1.** Bilingual UI + the `i18n:check` gate is the P0 finding
and the constitution-defining deliverable; ship it first and it is independently
valuable. Then US2 + US3 (the remaining P0 mis-tap/legibility fixes), then the
P2 stories (US4, US5, US7), then the P3 polish (US6, US8). Each story is a
complete, independently testable increment; commit per story after its gates
pass, per the trunk-based workflow.

## Summary

- **Total tasks**: 38
- **Setup**: 1 · **Foundational**: 2 · **US1**: 11 · **US2**: 3 · **US3**: 2 · **US4**: 4 · **US5**: 2 · **US7**: 5 · **US6**: 2 · **US8**: 3 · **Polish**: 3
- **Parallel opportunities**: the eight US1 localization tasks (T005–T012); US7's T026/T028; US8's T033/T034.
- **MVP scope**: Phase 3 (US1) — bilingual UI + `i18n:check` gate.
