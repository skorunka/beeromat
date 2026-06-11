# Tasks: Admin Data Correction

**Feature**: `specs/031-admin-data-correction/` | **Branch**: `main` (trunk-based)

**Scope**: surgical per-record corrections only — void any consumption (US1),
reverse a confirmed payment (US2), reach existing match/bet reversals (US3).
NO club-wide reset. Reuses existing audited actions; no new schema/transaction.

**Test layers** (per plan.md): unit (authz/schemas) + integration (the bulk:
void/reverse transactions, broadened query) + component (the controls). E2E N/A.

---

## Phase 1: Setup

No new dependencies, schema, or infra. (Setup is a no-op for this feature.)

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T001 Audit `voidConsumptionAction` authz in `app/[locale]/(app)/log/actions.ts`: confirm `club_admin` is in the override-role set that may void past the undo window, and that no separate guard blocks voiding a *settled* (already-paid) consumption. Widen the override set / permission predicate (`lib/permissions.ts` or equivalent) if `club_admin` is missing. Document the resolved authz in a code comment.
- [ ] T002 Audit `voidConfirmedPaymentAction` in `app/[locale]/(app)/admin/pending/actions.ts`: confirm it is `club_admin`-gated, club-scoped, idempotent (ALREADY_VOIDED), and returns a result shape the UI can branch on. Note any gap to fix.
- [ ] T003 [P] Broaden `getMemberTabForAdmin` in `lib/db/queries/consumption.ts` to return the member's balance-affecting entries across **all sessions** (not only the open one), each carrying a per-row `canVoid` flag for admin (id + kind needed to call `voidConsumptionAction`). Keep the existing TabEntryRow shape.
- [ ] T004 [P] Add an admin query for a member's **confirmed** payments (id, amount, confirmedAt) in `lib/db/queries/payments.ts` (e.g. `getMemberConfirmedPayments(memberId, clubId)`), club-scoped.
- [ ] T005 [P] Add i18n keys for the corrections (cs + en) under `admin.*`: void-consumption label + confirm title/body, reverse-payment label + confirm title/body, success/already-done toasts, the all-time consumptions + confirmed-payments section headings (`messages/cs.json`, `messages/en.json`).

**Checkpoint**: admin authz confirmed; the member-detail page can fetch all-time consumptions + confirmed payments; copy exists.

---

## Phase 3: User Story 1 — Void any consumption (Priority: P1)

**Goal**: admin removes any wrong/test beer; balance + stock adjust; audited.

**Independent test**: void an unpaid beer (balance drops, stock +1), void a paid beer (member → credit), re-void (ALREADY_VOIDED no-op).

- [ ] T006 [US1] Create `components/admin/admin-void-consumption-button.tsx`: `useConfirm()` dialog → `voidConsumptionAction({ consumptionId })`; on ok toast success + `router.refresh()`; on `ALREADY_VOIDED`/`FORBIDDEN` toast the right message; disabled while pending. (No native dialogs.)
- [ ] T007 [US1] Wire the void control into the admin member-detail consumption rows in `app/[locale]/(app)/admin/balances/[memberId]/page.tsx`: render the broadened all-time entries (T003) and attach `AdminVoidConsumptionButton` on each `canVoid` row.
- [ ] T008 [P] [US1] Integration test `tests/integration/admin-void-consumption.spec.ts`: admin voids an OLD/settled consumption → member balance drops (into credit when previously paid); stock restored; `consumption_voids` row written with admin actor; second void → ALREADY_VOIDED no-op; voiding a bet-originated consumption keeps bet legs consistent.
- [ ] T009 [P] [US1] Component test `tests/component/admin-void-consumption-button.spec.tsx`: confirm dialog fires the action with the row id; success toast + refresh; ALREADY_VOIDED → error toast, no crash.

**Checkpoint**: US1 independently usable — admin can void any consumption.

---

## Phase 4: User Story 2 — Reverse a confirmed payment (Priority: P1)

**Goal**: admin reverses a wrongly-confirmed/test payment; owed balance restored; audited.

**Independent test**: reverse a confirmed payment (owed rises by the amount), re-reverse (ALREADY_VOIDED no-op).

- [ ] T010 [US2] Create `components/admin/admin-reverse-payment-button.tsx`: `useConfirm()` → `voidConfirmedPaymentAction({ paymentId })`; toast + `router.refresh()`; idempotent/forbidden handling; disabled while pending.
- [ ] T011 [US2] Add a "confirmed payments" section to `app/[locale]/(app)/admin/balances/[memberId]/page.tsx` using the T004 query, each row showing amount + date + `AdminReversePaymentButton`.
- [ ] T012 [P] [US2] Integration test `tests/integration/admin-reverse-payment.spec.ts`: admin reverses a confirmed payment → member owed balance rises by the amount; `payment_state_transitions` records the reversal with admin actor; second reverse → ALREADY_VOIDED no-op; non-admin/cross-club rejected.
- [ ] T013 [P] [US2] Component test `tests/component/admin-reverse-payment-button.spec.tsx`: confirm → action with payment id; success + refresh; already-reversed → error toast.

**Checkpoint**: US2 independently usable — admin can reverse a confirmed payment. Together US1+US2 fully clear the treasurer's test data record-by-record.

---

## Phase 5: User Story 3 — Reach match/bet corrections (Priority: P3, reuse)

**Goal**: ensure a `club_admin` can reverse a recorded match / cancel an agreement (existing `/match` paths) so bet-skewed balances are correctable.

**Independent test**: as admin, reverse a recorded match → related charges/IOUs unwind.

- [ ] T014 [US3] Verify `club_admin` can reach `reverseResultTx` / `cancelAgreementTx` / `voidBeerDebtTx` from `/match` (the existing record-result/agreement surfaces honour the admin role). Widen authz ONLY if a concrete gap is found; otherwise record in the spec that no change was needed.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T015 Re-read the admin member-detail end-to-end for consistency (headings, ordering: balance → all-time consumptions w/ void → confirmed payments w/ reverse → record-payment form); ensure avatars/locale formatting match the rest of admin.
- [ ] T016 Run the gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:component`, `pnpm build`, `pnpm i18n:check`, `pnpm forms:check` — all green. (E2E N/A per plan.)
- [ ] T017 Update the CLAUDE.md shipped-log entry for spec 031 (between the SPECKIT markers) describing the surgical corrections + the reuse of existing audited actions.

---

## Dependencies & Order

- **Phase 2 (T001–T005)** blocks everything (authz + queries + copy).
- **US1 (T006–T009)** and **US2 (T010–T013)** are independent of each other once Phase 2 is done — can be built in either order; both touch the same page file (T007/T011) so those two edits serialize.
- **US3 (T014)** is independent (verification of existing surfaces).
- **Polish (T015–T017)** last.

## Parallel opportunities

- T003, T004, T005 are parallel ([P]) — different files.
- Within US1: T008 + T009 parallel (different test files). Within US2: T012 + T013 parallel.

## MVP

US1 alone (void any consumption) is a usable MVP — it covers the most common
"wrong number" case. US2 completes the treasurer-test-data scenario.

## Implementation strategy

Foundational first (authz truth + broadened query + copy), then US1, then US2
(both P1), then the US3 verification, then gates + shipped-log. Reuse the
existing audited actions throughout — no new transaction, no hard delete.
