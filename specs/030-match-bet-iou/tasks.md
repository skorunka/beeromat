---
description: "Task list for spec 030 — deferred match-bet settlement (beer IOU)"
---

# Tasks: Deferred match-bet settlement (beer IOU / dlužné pivo)

> **Implementation status (2026-06-02):** SHIPPED across three commits on
> `main`. Done: Phase 1–2 (schema/migration/helpers/i18n), US1 (record→
> pending debts + home IOU UI + query), US2 (deliverBeerDebtTx + action +
> deliver control), US3 (create-form beer picker), US4 (Vítěz/Vítězové
> heading), US5 (casual box removed from UI + hub "Sázky k vyrovnání"
> list), plus reverse-voids-debts (T036) and the test migrations (T010/
> T035 via migration + deletion). Gates all green: typecheck, lint,
> unit 203, integration 252, component, i18n, forms, build.
> **Deferred to BACKLOG** (noted in CLAUDE.md): deep removal of the
> now-dead casual `createBetTransferAction` + `lib/db/queries/bets.ts`
> casual query + their 3 integration tests, and the casual `bet.*` i18n
> key cleanup — left as dead-but-green code so the bet query layer +
> those tests stay stable. Live quickstart (T040) pending a clean dev
> restart.

**Input**: Design documents from `specs/030-match-bet-iou/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/beer-iou.md, quickstart.md
**Tests**: REQUIRED (Constitution VIII — every behaviour change lands with tests). Layers: unit + integration + component; no E2E (rig dormant — see plan.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1–US5 from spec.md
- Priority order: US1 (P1) → US2 (P1) → US3 (P2) → US5 (P2) → US4 (P3)

---

## Phase 1: Setup (schema building blocks)

- [ ] T001 [P] Create `lib/db/schema/match-bet-debts.ts`: `match_bet_debt_status` pgEnum (`pending|settled|voided`) + `matchBetDebts` table per data-model.md (club_id, match_id, agreement_id, from/to member, planned_beer_type_id, beer_count, status, audit + settle/void fields), with the distinct-members / status-consistency / beer_count checks and the partial from/to-pending indexes. Export inferred types.
- [ ] T002 [P] Add `betBeerTypeId` (uuid, nullable, FK → beerTypes, `set null`) to `matchAgreements` in `lib/db/schema/matches.ts`.
- [ ] T003 Register the new table/enum in the schema barrel (`lib/db/schema/index.ts` or equivalent) so Drizzle + queries see it (depends on T001).
- [ ] T004 Generate the Drizzle migration (`pnpm drizzle-kit generate`) for T001+T002 and verify the generated SQL in `drizzle/` (new table + enum + indexes + checks + the added column); apply it to the local dev DB (depends on T001–T003).

**Checkpoint**: schema + migration in place; `pnpm typecheck` clean.

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T005 [P] Create `lib/match/winner-label.ts`: pure helper returning the winner heading from `format` + winner name(s) — singles → "Vítěz: {name}", doubles → "Vítězové: {a + b}" (returns a key + values for the catalog, no hardcoded copy).
- [ ] T006 [P] Unit test `tests/unit/winner-label.spec.ts`: singles → singular key + one name; doubles → plural key + joined names; empty/edge inputs.
- [ ] T007 [P] Extend `lib/validation/match-agreement.ts` `createAgreementSchema` with optional `betBeerTypeId` (string uuid | null) + unit test in `tests/unit/match-agreement-schema.spec.ts` (accepts null, accepts uuid, ignored shape when friendly).
- [ ] T008 Add new i18n keys to `messages/cs.json` + `messages/en.json` (Czech-first) per contracts/beer-iou.md §7 (`matchBet.oweBeer/owedBeer/deliver/deliverConfirm/settledToast/alreadySettled`, `match.toSettleHeading/winnerSingular/winnerPlural/betBeerLabel`); keep catalogs key-identical. (Casual-key removal happens in US5/Polish.)

**Checkpoint**: schema, pure helpers, validation, and copy exist; `pnpm test:unit` + `pnpm i18n:check` green.

---

## Phase 3: User Story 1 — Winner/loser see the IOU; recording creates pending debts, no money (Priority: P1) 🎯 MVP

**Goal**: Recording a for-beer result creates pending `match_bet_debts` (no consumption/transfer/stock), visible to both members on home.

**Independent Test**: Record a for-beer singles result → both members see the IOU on home; no tab/balance/stock change; a friendly match creates none.

### Tests for US1

- [ ] T009 [P] [US1] Integration test `tests/integration/record-result-creates-debts.spec.ts`: for-beer singles → 1 pending debt, 0 consumptions, 0 bet_transfers, stock unchanged; doubles → 2 pending debts per pairing; friendly → 0 debts; `matches` history rows still written; double-submit still `ALREADY_RECORDED`.
- [ ] T010 [P] [US1] Migrate `tests/integration/match-agreement-tx.spec.ts` (and any record-result spec asserting auto-settlement) to the deferred model: assert debts created, not transfers.
- [ ] T011 [P] [US1] Component test `tests/component/match-bet-module.spec.tsx` (update): winner sees "Dluží ti pivo — {loser}", loser sees "Dlužíš pivo — {winner}"; pending → no money copy; renders nothing when no IOUs.

### Implementation for US1

- [ ] T012 [US1] Modify `recordResultTx` in `lib/db/queries/match-agreements.ts`: keep `matches`-row + result-stamp logic; REMOVE the for-beer settlement block (no consumption/transfer/stock/session); when `forBeer`, insert one pending `matchBetDebts` per pair (from=loser, to=winner, planned=agreement.betBeerTypeId, beer_count=club.matchLoserBeerCount). Return `{ debtsCreated }`.
- [ ] T013 [US1] Update `recordResultAction` in `app/[locale]/(app)/match/actions.ts`: drop `betBeerOverrideId`; return `{ ok, debtsCreated }`.
- [ ] T014 [US1] Update `app/[locale]/(app)/match/[agreementId]/RecordResultForm.tsx`: remove the spec-025 bet-beer tile picker + override state; record buttons only. Update its toast (no "vyrovnáno"/settled wording — result recorded, IOU created).
- [ ] T015 [P] [US1] Create `lib/db/queries/match-bet-debts.ts` `listBeerDebtsForMember({ clubId, memberId })` → `{ owedToMe, iOwe }` pending lists with counterparty name/avatar + planned beer name (club-scoped).
- [ ] T016 [US1] Update `lib/db/queries/match-bet-summary.ts`: replace won/lost transfer counts with pending-debt counts (owed-to-me / I-owe) for the home headline.
- [ ] T017 [P] [US1] Create `components/match/beer-iou-row.tsx`: one IOU row (counterparty avatar + name + planned beer + direction wording). Deliver button is added in US2 (render a placeholder/disabled slot now or accept an optional action prop).
- [ ] T018 [US1] Update `components/home/match-bet-module.tsx` to render pending IOUs (both directions) via `beer-iou-row`, using the US1 query/summary; remove the old auto-settled won/lost messaging.

**Checkpoint**: win a for-beer match → both see the IOU on home, nothing charged. MVP.

---

## Phase 4: User Story 2 — Either party marks delivered → cost booked, IOU settled (Priority: P1)

**Goal**: From a pending IOU, "Předáno" books exactly one beer's cost to the loser (reusing the existing settle path), decrements stock, settles the debt; idempotent.

**Independent Test**: Tap "Předáno" → loser's balance up by the beer price, stock −1, winner unchanged, IOU gone; second tap is a no-op.

### Tests for US2

- [ ] T019 [P] [US2] Integration test `tests/integration/deliver-beer-debt.spec.ts`: delivery creates `beer_count` consumptions + bet_transfers (winner→loser) + `match_bet_transfers` links, decrements stock, stamps `settled`; loser balance += price, winner unchanged; override beer respected; out-of-stock → `OUT_OF_STOCK` (no partial write); second delivery → `ALREADY_SETTLED` no double-charge; authz (non-participant non-treasurer → `FORBIDDEN`).
- [ ] T020 [P] [US2] Integration test `tests/integration/deliver-balance-invariant.spec.ts`: after delivery, `effectiveConsumptionTotal(member, session)` == Σ countable `getMyTabForSession` entries for both members.
- [ ] T021 [P] [US2] Component test `tests/component/beer-iou-row.spec.tsx`: deliver control shows planned beer pre-filled, override dropdown closes on select, disabled while in-flight, dispatches `deliverBeerDebtAction` with `{debtId, beerTypeId}`, success toast, error (ALREADY_SETTLED) surfaced.

### Implementation for US2

- [ ] T022 [US2] Add `deliverBeerDebtTx` to `lib/db/queries/match-bet-debts.ts` (or match-agreements.ts): `FOR UPDATE` guard on `status='pending'` (else ALREADY_SETTLED); resolve beer (override → planned → `pickBetBeer` fallback, club + not-archived else BEER_NOT_AVAILABLE); ensure open session; loop `beer_count`× the existing `settleOnePair` body (stock−1 else OUT_OF_STOCK, winner consumption, bet_transfer winner→loser, match_bet_transfers link); stamp settled fields.
- [ ] T023 [US2] Add `deliverBeerDebtAction(input)` to `app/[locale]/(app)/match/actions.ts`: authz (debt participant OR treasurer/club_admin, club-scoped); typed result per contract.
- [ ] T024 [US2] Wire the deliver control in `components/match/beer-iou-row.tsx`: "Předáno" → `BeerPickerDropdown` (planned pre-selected, close-on-select) → confirm via `useConfirm` (no native dialog) → `deliverBeerDebtAction` → celebrate/toast + `router.refresh()`.

**Checkpoint**: full loop works — win, see IOU, deliver, loser charged once.

---

## Phase 5: User Story 3 — Pick the beer at match-create (Priority: P2)

**Goal**: For-beer create form has a beer picker; the choice becomes each IOU's default.

**Independent Test**: Create a for-beer match with beer X → its IOUs default to X at delivery; friendly → no picker.

### Tests for US3

- [ ] T025 [P] [US3] Component test `tests/component/new-match-agreement-form.spec.tsx`: beer picker shown only when "🍺 Ano"; hidden for "Přátelák"; close-on-select; submit includes `betBeerTypeId`.
- [ ] T026 [P] [US3] Integration test (extend T009/`record-result-creates-debts`): debts' `planned_beer_type_id` equals the agreement's chosen beer.

### Implementation for US3

- [ ] T027 [US3] Add the beer picker to `app/[locale]/(app)/match/NewMatchAgreementForm.tsx` using `BeerPickerDropdown` (close-on-select), visible only when `forBeer`; add `betBeerTypeId` to the form values + `buildInput`. Load in-stock beers on `app/[locale]/(app)/match/page.tsx` and pass down.
- [ ] T028 [US3] Update `createAgreementAction` + `createAgreementTx` (`lib/db/queries/match-agreements.ts`) to persist `betBeerTypeId` to `match_agreements.bet_beer_type_id` (validate beer is club + not archived → `BEER_NOT_AVAILABLE`).

**Checkpoint**: match-create beer flows through to the IOU default.

---

## Phase 6: User Story 5 — Remove casual box; match hub lists pending IOUs (Priority: P2)

**Goal**: One coherent bet concept — delete the casual "take someone's drink" surface; the `/match` hub shows "Sázky k vyrovnání".

**Independent Test**: `/match` has no casual section; pending IOUs (both directions) listed with deliver.

### Tests for US5

- [ ] T029 [P] [US5] Component test for the match-hub IOU list (`tests/component/match-to-settle.spec.tsx` or extend the hub section test): renders the viewer's pending IOUs both directions with deliver; empty state when none.

### Implementation for US5

- [ ] T030 [US5] Replace the casual section in `app/[locale]/(app)/match/BetSettleSection.tsx` (and `page.tsx`) with a "Sázky k vyrovnání" list rendering `beer-iou-row` from `listBeerDebtsForMember`.
- [ ] T031 [US5] Delete `createBetTransferAction` from `app/[locale]/(app)/bet/actions.ts` and the casual "Pití, co si můžeš vzít / Beru si ho" UI in `components/bet/transfer-list.tsx` (remove the file if nothing else imports it; keep `getBetTransfersForSession` for history detail). Remove any now-dead `getTransferableConsumptionsForCurrentSession` usage.
- [ ] T032 [US5] Remove obsolete casual `bet.*` keys (`drinksYouCanTake`, `transferToMe`, `noOtherDrinks`, `subtitle` "Vezmi si na svou útratu…", `title` if unused) from `messages/cs.json` + `messages/en.json`; delete the matching component tests for the removed UI.

**Checkpoint**: only the IOU bet concept remains; `pnpm i18n:check` still key-identical.

---

## Phase 7: User Story 4 — Vítěz/Vítězové result wording (Priority: P3)

**Goal**: Result heading names winners as a noun, singular/plural by format.

**Independent Test**: singles → "Vítěz: {name}"; doubles → "Vítězové: {names}".

### Tests for US4

- [ ] T033 [P] [US4] Component test for the result heading (`tests/component/match-result-heading.spec.tsx` or extend an existing match page/test): singles renders singular key, doubles renders plural with both names.

### Implementation for US4

- [ ] T034 [US4] Apply `winner-label` at the render sites: `app/[locale]/(app)/match/[agreementId]/page.tsx` (recordedHeading), `RecordResultForm` recorded toast, and `RecentResultsList.tsx`/home where "Vyhrál/a" appears — replace with `match.winnerSingular/winnerPlural` fed the winner name(s) from the lineup.

**Checkpoint**: no "Vyhrál/a" remains in the result surfaces.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T035 Migrate remaining settlement-at-record integration tests to the deferred/deliver model: `tests/integration/match-settle-with-bet.spec.ts`, `match-settle-insufficient-stock.spec.ts`, `tab-total-bet-parity.spec.ts`, `all-member-balances-bet-transfer.spec.ts`, `record-result-already-recorded.spec.ts` — drive money via `deliverBeerDebtTx`, not `recordResultTx`.
- [ ] T036 Update reverse/cancel: `cancelAgreementTx` (+ reverse path) in `lib/db/queries/match-agreements.ts` voids pending debts (status `voided`, no money) and, for settled debts, voids the linked transfers via the existing path; integration test `tests/integration/reverse-match-debts.spec.ts` (reverse-while-pending = no money; reverse-after-deliver = money unwinds).
- [ ] T037 [P] Update component test `tests/component/record-result-form.spec.tsx` for the removed bet-beer picker.
- [ ] T038 Run `pnpm i18n:check` + add any picker/IOU component to the EXCLUDED set ONLY if a genuine `=>`/generic regex false-positive occurs (audit, don't blanket-add).
- [ ] T039 Run the full gate suite: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:component`, `pnpm build`, `pnpm i18n:check`, `pnpm forms:check`.
- [ ] T040 Execute `specs/030-match-bet-iou/quickstart.md` live (Docker browser, two members) — happy path + every edge check; fix anything that misbehaves.
- [ ] T041 Update `CLAUDE.md` SPECKIT block: move spec 030 from "Currently planning" to "Most recently shipped" with the final shape; note the new BACKLOG items (your-bets ledger view; unsettled-IOU nudges).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** block everything.
- **US1 (P1)** is the MVP and must precede US2 (deliver needs debts), US5 (hub list needs the query + row), and US4 (uses winner-label but independent).
- **US2** depends on US1 (debts + beer-iou-row).
- **US3** depends on Foundational (column) + US1 (recordResultTx reads the planned beer; works null-safe without US3).
- **US5** depends on US1 + US2 (reuses query + deliver in the hub list).
- **US4** depends on Foundational (winner-label); otherwise independent.
- **Polish** last.

### Within each story

- Tests written first and expected to fail, then implementation (Constitution VIII).
- Schema/query before UI; action before the control that calls it.

### Parallel opportunities

- T001/T002, T005/T006/T007 in parallel (different files).
- Within US1: T009/T010/T011 (tests) parallel; T015/T017 parallel with T012 (different files).
- Across stories after US1+US2 land: US3, US4 can proceed in parallel.

---

## Implementation Strategy

**MVP** = Phase 1 + 2 + US1 + US2: a for-beer match creates a visible IOU that either party can settle with one tap, money correct. Ship/validate that first (the core fix), then layer US3 (create-time beer), US5 (remove casual + hub list), US4 (wording), then Polish (test migration, reverse, gates, quickstart).

## Notes

- The balance invariant is the load-bearing guarantee — T020 explicitly verifies it after delivery.
- Reverse/cancel (T036) is correctness-critical: pending debts must void with zero money movement.
- No E2E (plan.md); integration covers the two transactions, component covers the UI seams.
