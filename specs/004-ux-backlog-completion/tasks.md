---
description: "Task list for UX Backlog Completion (v1.3)"
---

# Tasks: UX Backlog Completion (v1.3)

**Input**: Design documents from `specs/004-ux-backlog-completion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ux.md

**Tests**: Test tasks ARE included — spec SC-008 requires every acceptance
scenario to have an automated E2E assertion.

**Organization**: Tasks are grouped by user story; each story is one slice of
the v1 UX-review backlog and is independently implementable and verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US6 maps the task to its spec user story

**Verifiable Tasks rule (constitution).** Every task below is observable by a
gate (`typecheck`, `lint`, `i18n:check`, `forms:check`, `build`) or an
acceptance E2E test.

## Path Conventions

Single Next.js App Router app at the repository root: `app/`, `components/`,
`lib/`, `messages/`, `tests/e2e/`.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The `/account` hub is the shared home for the payment-history
link (US1) and the sign-out control (US4); it must exist before either story
fills it. v1.3 adds no dependencies and no other shared infrastructure.

- [X] T001 Create `app/[locale]/(app)/account/page.tsx` — the member account hub: a Server Component showing the signed-in member's display name, with a clearly-labelled region for the payment-history link (US1) and the sign-out control (US4) to be added by those stories. Add the `account.*` catalog keys (title, etc.) to `messages/cs.json` and `messages/en.json` in the mate-to-mate tone; confirm `pnpm i18n:check` passes.
- [X] T002 In `app/[locale]/(app)/page.tsx`, make the home-screen greeting (`Ahoj {name}`) a tappable link to `/account` (a ≥44 px target), so the hub is reachable.

**Checkpoint**: The account hub exists and is reachable from home.

---

## Phase 2: User Story 1 - A member can see their own payment history (Priority: P1) 🎯 MVP

**Goal**: A member has a screen showing their own payment timeline — every
payment with its amount, date, and current state (pending/confirmed/disputed).

**Independent Test**: Sign in as a member with mixed-state payments; open
`/account/payments`; every payment appears with amount, date, and state, and
confirmed payments are visible.

- [X] T003 [US1] Implement `getPaymentHistory` in `lib/db/queries/payments.ts` — a read query returning the signed-in member's own `payments` (scoped by `memberId` + `clubId`), most-recent-first, each with amount/currency/status/origin/createdAt and the resolved-at timestamp + dispute reason from `payment_state_transitions`, per data-model.md "Returned shape". Read-only; no writes.
- [X] T004 [P] [US1] Create `components/payments/payment-history-list.tsx` — renders the timeline: one row per payment with the amount (formatted via `Intl` for the club locale), the date, a localized state badge (pending / confirmed / disputed), and the dispute reason on a disputed row; renders a friendly localized empty state when the list is empty. Catalog strings only.
- [X] T005 [US1] Create `app/[locale]/(app)/account/payments/page.tsx` — a Server Component that calls `getPaymentHistory` for the signed-in member and renders `PaymentHistoryList`. Add the `payments.*` catalog keys (cs + en); confirm `pnpm i18n:check` passes.
- [X] T006 [US1] Add a "Payment history" link on the `/account` hub (`app/[locale]/(app)/account/page.tsx`) pointing to `/account/payments`, ≥44 px.
- [X] T007 [P] [US1] Create `tests/e2e/ux2-payment-history.spec.ts` asserting US1 scenarios 1–5: mixed-state payments show with amount/date/state; a disputed payment shows the disputed state; the empty state; cs + en rendering; a member sees only their own payments.

**Checkpoint**: The member payment-history screen is complete and testable.

---

## Phase 3: User Story 2 - Friendlier stock management (Priority: P2)

**Goal**: Restock is the dominant row action; the stock-adjust flow uses a
positive quantity + Add/Remove choice — no signed numbers.

**Independent Test**: On the beer-type list Restock is the prominent action;
the adjust flow asks for a positive quantity and an Add/Remove choice;
removing more than current stock is rejected in-app.

- [X] T008 [US2] In `lib/validation/stock.ts`, replace the adjust schema's signed `delta` field with `{ quantity: positive-integer string, mode: 'add' | 'remove', reason }` — emitting catalog message keys for each constraint (reuse `admin.invalidQuantity` for the quantity, `admin.adjustReasonRequired` for the reason).
- [X] T009 [US2] In `components/admin/beer-type-manager.tsx`: (a) make the Restock button the visually dominant action on each beer-type row, with Adjust / Edit / Archive / History visibly secondary (FR-005); (b) rewrite `AdjustForm` to collect a positive quantity + an Add-stock / Remove-stock choice, compute the signed `delta` (`remove → -quantity`) and call the **unchanged** `recordStockAdjustmentAction`, mapping `WOULD_GO_NEGATIVE` to `FormRootError`. Add the add/remove catalog keys (cs + en); keep the form on the v1.2 react-hook-form layer so `forms:check` stays green.
- [X] T010 [P] [US2] Create `tests/e2e/ux2-stock-friendlier.spec.ts` asserting US2 scenarios 1–4: Restock visually primary; the adjust flow offers quantity + Add/Remove with no signed field; an over-draw Remove is rejected in-app; a valid Add and Remove change stock by exactly that amount.

**Checkpoint**: Stock management is friendlier; US1 + US2 both testable.

---

## Phase 4: User Story 3 - The home balance reflects a just-logged beer (Priority: P2)

**Goal**: After logging (or undoing) a beer, the home-screen balance reflects
it without a manual revisit.

**Independent Test**: Log a beer → home balance rises; undo it → balance drops.

- [X] T011 [US3] In `app/[locale]/(app)/log/actions.ts`, add `revalidatePath('/')` to both the log-consumption action and the undo/void action (alongside the existing `revalidatePath('/log')` / `revalidatePath('/tab')`), so the home Server Component recomputes the balance. No change to the balance calculation.
- [X] T012 [P] [US3] Create `tests/e2e/ux2-home-balance.spec.ts` asserting US3 scenarios 1–2: the home balance increases after a log and decreases after an undo.

**Checkpoint**: The home balance is live; US1–US3 testable.

---

## Phase 5: User Story 4 - A member can sign out (Priority: P2)

**Goal**: A reachable sign-out control that ends the session.

**Independent Test**: From the account hub, use sign-out; the session ends and
a protected screen then requires signing in again.

- [ ] T013 [P] [US4] Create `components/account/sign-out-button.tsx` — a client control that invokes the existing `signOutDeviceAction` and then sends the member to the signed-out entry point. Catalog string for the label.
- [ ] T014 [US4] Add the `SignOutButton` to the `/account` hub (`app/[locale]/(app)/account/page.tsx`), ≥44 px.
- [ ] T015 [P] [US4] Create `tests/e2e/ux2-sign-out.spec.ts` asserting US4 scenarios 1–2: the control is present on the hub; using it ends the session and a protected screen afterwards requires a fresh sign-in.

**Checkpoint**: Sign-out is reachable; US1–US4 testable.

---

## Phase 6: User Story 5 - Clearer empty states and guidance (Priority: P3)

**Goal**: The log empty state is friendly; the dispute banner offers a next step.

**Independent Test**: The log screen with no beer types shows friendly copy;
the dispute banner includes an actionable link.

- [ ] T016 [US5] Give the log screen a friendly empty state when the club has no beer types — localized copy consistent in tone with the history/balances empty states (in `app/[locale]/(app)/log/page.tsx` or the beer grid it renders). Add/adjust the `log.empty` catalog keys (cs + en).
- [ ] T017 [US5] In `components/dispute-banner.tsx`, add an actionable link to the Settle screen alongside the explanation (FR-013); confirm the banner still disappears once the payment leaves the disputed state (FR-014). Add the banner action-link catalog key (cs + en).
- [ ] T018 [P] [US5] Create `tests/e2e/ux2-guidance.spec.ts` asserting US5 scenarios 1–2: the log empty state shows for a club with no beer types; the dispute banner shows an actionable link for a member with a disputed payment.

**Checkpoint**: The dead-end screens now guide; US1–US5 testable.

---

## Phase 7: User Story 6 - Money-input guidance and bet visibility polish (Priority: P3)

**Goal**: Money inputs show format helper text; the bet screen shows a
running transfer tally.

**Independent Test**: A money-amount input shows helper text; a member with
bet transfers this session sees a running tally.

- [ ] T019 [US6] Add helper text stating the accepted amount format to each money-amount input — `components/settle/paid-other-method.tsx`, `components/treasurer/manual-payment-form.tsx`, and the price / restock-quantity fields in `components/admin/beer-type-manager.tsx` — using the existing `FormDescription` primitive from `components/ui/form.tsx`. Add the helper-text catalog key (cs + en).
- [ ] T020 [US6] In `components/bet/transfer-list.tsx` (or the bet page), show the member a running tally of their own bet transfers for the open session, distinct from the home-balance figure; no tally line when there are none. Tighten the bet / variable-symbol copy per review findings F7/F13. Catalog strings (cs + en).
- [ ] T021 [P] [US6] Create `tests/e2e/ux2-polish.spec.ts` asserting US6 scenarios 1–2: a money-amount input shows format helper text; a member with session bet transfers sees a running tally.

**Checkpoint**: All six stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T022 Run the full Playwright suite (`pnpm exec playwright test`); fix any pre-existing v1/v1.1/v1.2 spec broken by a v1.3 markup change — notably `tests/e2e/us7-stock.spec.ts` (the adjust form's `#delta` field is replaced by a quantity + Add/Remove choice) and any spec that interacted with the home greeting now being a link. Update spec assertions, not app behaviour.
- [ ] T023 Run all seven verification gates — `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm i18n:check`, `pnpm forms:check`, `pnpm build`, `pnpm exec playwright test` — and confirm every one passes; walk the `quickstart.md` verification in both locales.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: no dependencies — start immediately. **Blocks
  US1 and US4** (both fill the `/account` hub it creates). US2/US3/US5/US6 do
  not depend on it.
- **User Stories (Phases 2–7)**: each depends only on Foundational (US1, US4)
  or on nothing (US2, US3, US5, US6). They are independent of each other and
  may proceed in parallel or in priority order.
- **Polish (Phase 8)**: depends on all six stories being complete.

### User Story Dependencies

- **US1 (P1)** — needs Foundational (the hub to link from). Independent of US2–US6.
- **US2 (P2)** — independent; touches only the stock UI + `lib/validation/stock.ts`.
- **US3 (P2)** — independent; touches only the log actions.
- **US4 (P2)** — needs Foundational (the hub to place sign-out in).
- **US5 (P3)** — independent; log empty state + dispute banner.
- **US6 (P3)** — independent; money inputs + bet screen.

### Within Each User Story

- The query (T003) before the screen that renders it (T005).
- The schema (T008) before the form that uses it (T009).
- The E2E spec for a story can be written in parallel ([P]) and is run to verify it.

### Parallel Opportunities

- After Foundational, US1–US6 can each be taken by a different developer.
- Within a story, `[P]` tasks (the E2E specs T007/T010/T012/T015/T018/T021,
  and T004/T013 — distinct new files) run alongside their story's other work.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Foundational → Phase 2 US1.
2. **STOP and VALIDATE**: `ux2-payment-history.spec.ts` green — a member can
   see their own payment timeline. This is the headline backlog item (F20)
   and a shippable increment.

### Incremental Delivery

1. Foundational → US1 (MVP — the payment-history gap closed).
2. US2 → US3 → US4 → US5 → US6, each verified independently.
3. Polish → full suite green → the v1 UX review is fully discharged (SC-009).

### Notes

- [P] = different files, no dependency on an incomplete task.
- Commit after each task or logical group; reference the task ID and story.
- No domain entity, balance/payment/stock/bet calculation, or Server Action
  contract changes (FR-018) — `getPaymentHistory` is a contracted-but-unbuilt
  read query; the stock-adjust action keeps its signed-delta contract.
