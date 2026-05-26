---
description: "Task list for spec 018 — match-bet → home awareness"
---

# Tasks: Match-bet → home awareness

**Input**: Design documents from `/specs/018-match-bet-home-awareness/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`,
`data-model.md`, `contracts/settle-tx.md`,
`contracts/home-module.md`, `quickstart.md` — all complete.

**Tests**: Unit + Integration + Component all REQUIRED per the
plan's Test Layer Declaration (Constitution v1.10.0 Principle
VIII). No E2E (justified in plan.md).

**Organization**: Tasks grouped by user story per Constitution
Spec/Task Discipline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies).
- **[Story]**: User story label (US1 + US2 are intertwined — the
  same settle-transaction rewrite produces both the
  loser-awareness AND the winner-correctness outcomes, so the
  Phase 3 tasks carry the combined [US1+US2] label).
- Exact file paths included.

## Path Conventions

Next.js App Router monorepo. Paths from repo root.

---

## Phase 1: Setup

**Purpose**: Trivial scaffolding only.

- [ ] T001 Ensure `lib/match/` directory exists at repo root (auto-created when the first file is written under it).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure-function helpers + the new home query that ALL
user stories depend on.

**⚠️ CRITICAL**: No US-phase task can land before Phase 2 is green.

- [ ] T002 [P] Unit test `splitBeerCountAcrossPairs(count, numPairs)` in `tests/unit/split-beer-count.spec.ts`. Cases: singles (numPairs=1) returns `[count]` for any count; doubles count=2 → `[1, 1]`; doubles count=3 → `[2, 1]` (seat1 pair gets extra); doubles count=0 → `[0, 0]`; numPairs=0 → `[]`. Test MUST fail until T003.
- [ ] T003 Implement `lib/match/split-beer-count.ts` exporting `splitBeerCountAcrossPairs(count: number, numPairs: number): number[]` per the algorithm in `research.md` §2.
- [ ] T004 [P] Unit test `pickBetBeer(input)` in `tests/unit/default-bet-beer.spec.ts`. Cases: (1) override provided and valid → returns override; (2) override missing, winner's last-beer active+in-stock → returns last-beer; (3) override missing, last-beer null → falls back to cheapest in-stock; (4) override missing, last-beer archived → falls back to cheapest in-stock; (5) override missing, last-beer out of stock → falls back to cheapest in-stock; (6) all candidates exhausted → throws `NoBeerInStockError`. Test MUST fail until T005.
- [ ] T005 Implement `lib/match/default-bet-beer.ts` exporting `pickBetBeer({ override, lastBeer, catalog })` and `NoBeerInStockError`. Pure function — takes a snapshot of the inputs, doesn't query the DB. Used by `settleOnePair` after it loads the inputs.
- [ ] T006 [P] Integration test `matchBetSummaryForMember(memberId, clubId)` in `tests/integration/match-bet-summary.spec.ts`. Cases: (a) no bet-linked consumption → returns `{ betCount: 0, sourceMatchIds: [] }`; (b) one settled "for beer" match with member as loser, within 24h → returns the right shape; (c) voided bet-linked rows are excluded; (d) bet-linked rows older than 24h are excluded; (e) cross-club isolation — bet on club A doesn't surface for the same member-id in club B. Test MUST fail until T007.
- [ ] T007 Implement `lib/db/queries/match-bet-summary.ts` exporting `matchBetSummaryForMember(memberId, clubId)` per the SQL shape in `data-model.md`. Joins `consumptions` → `bet_transfers` → `match_bet_transfers` → `matches`, LEFT JOINs the void tables, filters by `to_member_id` + `club_id` + 24h window.

**Checkpoint**: All 6 tasks green → user-story phases unblocked.

---

## Phase 3: User Story 1 + User Story 2 — Loser awareness + winner correctness (Priority: P1) 🎯 MVP

**Goal**: When a "for beer" match settles, the auto-creation
transaction writes the winner's consumption rows + the loser's
bet_transfer rows in one atomic step. The loser's home reflects
the obligation; the winner's data is correct (consumption logged,
cost transferred away).

**Independent Test**: As Pavel, create a "for beer" singles
agreement against Honza. Submit Honza-wins via
`recordResultAction` (without an override beer). After the
action: Pavel's `consumptions` table has +1 row using Pavel's
last-beer (or cheapest if none), `bet_transfers` has +1 row from
Pavel → Honza, `match_bet_transfers` has +1 link, Honza's home
renders the `MatchBetModule` showing "Útrata z dnešního zápasu:
1× pivo". Reversing the match (existing
`reverseResultAction`) voids all three rows atomically and Honza's
home goes back to no module.

### Integration tests (US1+US2) — write before T009

- [ ] T008 [US1+US2] Integration test suite for the rewritten match-settle in `tests/integration/match-settle-with-bet.spec.ts`. 9 cases: (1) singles default beer; (2) singles no-last-beer fallback to cheapest; (3) singles no-in-stock-beer fails with `NO_BEER_IN_STOCK`; (4) doubles count=2 split [1,1]; (5) doubles count=3 split [2,1]; (6) override beer used not default; (7) auto-open session when none exists; (8) match-void cascades to consumption_voids + bet_transfer_voids and loser balance returns to pre-match; **(9) FR-003 invariant — winner's balance is unchanged by the bet** (their auto-created consumption + the offsetting bet_transfer net to zero on the winner's tab). Tests MUST fail until T009 + T013.

### Implementation — match-settle transaction (US1+US2)

- [ ] T009 [US1+US2] Rewrite `settleOnePair` in `lib/db/queries/match-agreements.ts` per `contracts/settle-tx.md`. Drop the "find existing winner consumption" lookup. Instead: insert N consumption rows on the winner (with the resolved beer + price snapshot), decrement `beer_types.current_stock` per row, insert a `stock_changes` audit row per decrement, then insert the matching `bet_transfer` + `match_bet_transfers`. New signature accepts the resolved `beerTypeId` from the caller.
- [ ] T010 [US1+US2] Update `recordResultTx` in the same file: (a) load `club.matchLoserBeerCount` (today: unread); (b) compute pairs as today; (c) call `splitBeerCountAcrossPairs` to get per-pair counts; (d) resolve the default beer ONCE for the whole match — load catalog snapshot + winner's last-beer + the optional override → call `pickBetBeer()`; (e) catch `NoBeerInStockError` and return `{ ok: false, code: 'NO_BEER_IN_STOCK' }`; (f) pass the resolved `beerTypeId` to each `settleOnePair` call along with that pair's count. The existing optimistic-concurrency stamp on `match_agreements.resultRecordedAt` stays unchanged.
- [ ] T011 [US1+US2] Extend `recordResultSchema` in `lib/validation/match-agreement.ts` with an optional `beerTypeId: z.string().uuid().optional()`. Existing required fields unchanged.
- [ ] T012 [US1+US2] Extend `RecordResultResult` type in `app/[locale]/(app)/match/actions.ts` with the new `NO_BEER_IN_STOCK` failure code + the `betBeerTypeId` field on success. Update `recordResultAction` to: (a) parse the new optional `beerTypeId`; (b) if provided, verify it via DB lookup (active, in-stock, same club) and return `VALIDATION_FAILED` with a `beerTypeId` field error on mismatch; (c) pass the validated id through to `recordResultTx`.
- [ ] T013 [US1+US2] Verify `reverseResultTx` voids the auto-created consumption rows in addition to the existing match + bet_transfer voids. If today's implementation doesn't (it likely doesn't, since today's flow only ever created transfers pointing at PRE-EXISTING consumptions — voiding those would clobber regular drinks), extend `reverseResultTx` in `lib/db/queries/match-agreements.ts` to insert `consumption_voids` rows for every `source_consumption_id` of the match's bet_transfers, with the same atomic-transaction guarantee.

### Catalog strings (US1+US2)

- [ ] T014 [P] [US1+US2] Add `home.matchBet.one`, `home.matchBet.many`, `home.matchBet.reverseOne`, `home.matchBet.reverseMany` to `messages/en.json`. Values from `contracts/home-module.md`. No nag tone.
- [ ] T015 [P] [US1+US2] Same keys in `messages/cs.json`. Czech values from the same contract. Verify no `dlužíš` / `dlužná` / `dlužit`.
- [ ] T016 [P] [US1+US2] Add `match.betPicker.label`, `match.betPicker.defaultHint`, `match.betPicker.override`, `match.errors.noBeerInStock` to `messages/en.json`. Czech: "Pivo, které vyhrávající vypije", "Standardně tvé poslední pivo", "Změnit", "Klub nemá na skladě žádné pivo — naskladněte před záznamem zápasu". English: parallel.
- [ ] T017 [P] [US1+US2] Same keys in `messages/cs.json`. Czech values.

### Component test — beer-picker (US1+US2) — write before T019

- [ ] T018 [US1+US2] Component test for the RecordResultForm beer-picker in `tests/component/record-result-beer-picker.spec.tsx`. Cases: picker hidden by default (collapsed); expanding shows the catalog options with the default beer pre-selected; selecting a different beer fires the form's onChange; submitting includes `beerTypeId` in the action call when overridden, OMITS it when default kept. Mocked `recordResultAction` via `vi.mock()`. Test MUST fail until T019.

### Implementation — beer-picker UI (US1+US2)

- [ ] T019 [US1+US2] Extend `app/[locale]/(app)/match/[agreementId]/RecordResultForm.tsx` with an optional expandable "Změnit pivo" section. Visible only when the agreement has `forBeer = true`. Default-collapsed; expanding reveals a select listing the current club's non-archived, in-stock beers. Default selection is computed by the page-level loader (last-beer or cheapest-in-stock) and passed as a prop. On submit, include `beerTypeId` in the payload only if changed from the default.

### Component test — MatchBetModule (US1+US2) — write before T021

- [ ] T020 [US1+US2] Component test for the home module in `tests/component/match-bet-module.spec.tsx`. Cases: V1 `betCount === 0` → renders nothing; V2 `betCount > 0, sourceMatchIds.length === 1` → renders the one-match copy + a Link to `/match/{id}`; V3 multi-match → renders the plural copy + a Link to `/match`. Test MUST fail until T021.

### Implementation — MatchBetModule (US1+US2)

- [ ] T021 [US1+US2] Create `components/home/match-bet-module.tsx`. Server component (no interactivity beyond the Link). Props: `{ betCount: number, sourceMatchIds: string[] }`. Returns `null` for V1; otherwise renders the row per `contracts/home-module.md`. Sits above the `<HomeOneTapLog />` on the home page.

### Wire MatchBetModule into the home page (US1+US2)

- [ ] T022 [US1+US2] Update `app/[locale]/(app)/page.tsx` to fetch the bet summary in parallel with `memberBalance()` + `lastBeerForMember()` (extend the existing `Promise.all`). Render `<MatchBetModule betCount={...} sourceMatchIds={...} />` between the balance sentence and `<HomeOneTapLog />`. The component returns null when count is 0, so nothing changes for members with no recent matches.

### Wire RecordResultForm default-beer prop (US1+US2)

- [ ] T023 [US1+US2] Update the parent page that renders `RecordResultForm` (`app/[locale]/(app)/match/[agreementId]/page.tsx` — verify exact file) to pass the default beer choice down. Compute it via the same `pickBetBeer` helper using a catalog query + the prospective-winner's `lastBeerForMember`. The form receives the prop and uses it as the picker's initial value.

**Checkpoint US1+US2**: Tapping submit on RecordResultForm
creates the winner's consumption + the loser's transfer atomically.
The loser's home renders the bet module. Reversing the match
voids all three row types and the balance returns. All 8
integration cases + both component test files green.

---

## Phase 4: User Story 3 — Treasurer audit + /tab distinction (Priority: P2)

**Goal**: Bet-linked consumption rows are visually distinguishable
on every screen that lists a member's drinks (per FR-004). The
treasurer can audit which drinks came from matches.

**Independent Test**: As any member with a mix of regular drinks
and bet-linked drinks in the current session, open `/tab`. The
bet-linked rows show a small "ze zápasu →" subtitle linking to
the match. As treasurer, open `/admin/balances/{memberId}`. The
bet-linked rows are similarly tagged.

### Catalog strings (US3)

- [ ] T024 [P] [US3] Add `tab.fromMatch` ("ze zápasu →" / "from the match →") to both catalogs. Add `admin.balances.fromMatch` if treating the admin view label differently (e.g., "ze zápasu č. 12 →"); keep simple and reuse `tab.fromMatch` if no distinction needed.

### Implementation — /tab distinction (US3)

- [ ] T025 [US3] Update `lib/db/queries/consumption.ts` → `getMyTabForSession`. The existing query already returns entries with `kind: 'consumption' | 'transfer_in' | 'transfer_out'`. Add a `sourceMatchId: string | null` field on each entry. For a regular consumption it's null; for a bet-linked consumption it's the match id (look up via `match_bet_transfers` → `matches.id`). Update the `MemberTabEntry` interface.
- [ ] T026 [US3] Update the /tab page (and any `tab-row` component) to render the "ze zápasu →" subtitle when `sourceMatchId !== null`. Link to `/match/{sourceMatchId}`.

### Implementation — admin balance audit view (US3)

- [ ] T027 [US3] Verify the `/admin/balances/[memberId]` view's list of consumptions also surfaces the bet-linked tag. Likely the existing audit query already pulls from `consumption.ts` helpers — if so, the badge falls through for free. Otherwise add a similar `sourceMatchId` field to the admin query.

**Checkpoint US3**: Both views show the bet-linked distinction;
treasurer can click through to the source match for audit.

---

## Phase 5: Polish & Cross-Cutting

**Purpose**: Cleanup + verification across all stories.

- [ ] T028 [P] Nag-tone audit: `grep -rE "dlu(žíš|žná|žit)|you owe|you must pay" messages/ app/[locale]/\(app\)/` MUST return empty. Document in the commit message that the grep was run.
- [ ] T029 [P] Update `BACKLOG.md`: add a "Shipped 2026-MM-DD as spec 018" line under the relevant UX section (or strike through the implicit "match-bet on home" item via spec reference, similar to how spec 017 was marked). Leave remaining UX items unchanged.
- [ ] T030 Run the full verification gate cycle: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm build && pnpm i18n:check && pnpm forms:check`. All 8 gates MUST pass before commit.
- [ ] T031 Run quickstart.md manual paths 1-5: singles happy, doubles split, override picker, no-stock failure, void cascade. Document any divergence as follow-ups.
- [ ] T032 Mark spec status `Shipped (YYYY-MM-DD)` in `spec.md`. Update CLAUDE.md SPECKIT marker to point to the next active spec (or to the constitution if nothing else is in flight). Commit + push to `main`.

---

## Dependencies & Execution Order

### Phase order

1. **Phase 1 (Setup)** — T001. Trivial.
2. **Phase 2 (Foundational)** — T002 through T007. Must complete before any US task. Three independent workstreams (split-beer / default-bet-beer / match-bet-summary) can land in parallel.
3. **Phase 3 (US1+US2)** — depends on Phase 2. The MVP. 16 tasks but high cohesion (transaction rewrite + UI components + catalog + page wiring).
4. **Phase 4 (US3)** — depends on Phase 3 (the bet-linked consumption rows must exist before /tab can render them).
5. **Phase 5 (Polish)** — depends on all above.

### Recommended linear order (single developer)

T001 → T002 ‖ T004 ‖ T006 → T003 → T005 → T007 →
T008 → **T013 (do this BEFORE T009 — see Risk note below)** →
T009 → T010 → T011 → T012 → T014 ‖ T015 ‖ T016 ‖ T017 →
T018 → T019 → T020 → T021 → T022 → T023 →
T024 → T025 → T026 → T027 →
T028 ‖ T029 → T030 → T031 → T032.

### Risk note — T013 ordering

T013 (verify/extend `reverseResultTx` cascade to
`consumption_voids`) is the highest-uncertainty task in this
spec. Today's `reverseResultTx` was written when settled
matches had no associated consumptions — only transfers
pointing at pre-existing consumptions. The new behavior
auto-creates consumptions, so void must cascade to them too.

The existing code likely doesn't do this. Recommended: do
T013 immediately after T008 (the integration test that drives
its requirement), BEFORE T009's settleOnePair rewrite. That
way the cascade infrastructure exists before the rows that
need it. If T013 turns out to be more than a small extension,
surface the scope concern before pushing on.

### Parallel opportunities

- T002 ‖ T004 ‖ T006 (different files; pure tests; no dependencies).
- T003 → after T002, T005 → after T004, T007 → after T006 (each impl after its test).
- T014 ‖ T015 ‖ T016 ‖ T017 (four catalog file edits across en/cs × home/picker).
- T028 ‖ T029 (different files; cleanup tasks).
- Within Phase 3, T012 ‖ T013 (different schema files) is also parallel.

---

## Implementation Strategy

### MVP scope = Phase 1 + Phase 2 + Phase 3 (US1+US2)

After Phase 3 the home shows the bet module, the data is
correct, the void cascade works. Phase 4 (US3 — the /tab + admin
distinction) is the "polish + audit trail" pass; can be deferred
if needed but the core flow is complete without it.

### Incremental delivery

- After Phase 2: helpers + new query exist with tests; no
  behavior change visible.
- After Phase 3: home renders the bet module + the transaction
  works. **MVP ship state.**
- After Phase 4: full audit-trail visual distinction on /tab +
  admin views.
- After Phase 5: gates green, BACKLOG updated, spec marked
  Shipped.

### Constitution v1.10.0 Test Layer Declaration (recap)

Tests in this spec live in:

- `tests/unit/split-beer-count.spec.ts` (T002).
- `tests/unit/default-bet-beer.spec.ts` (T004).
- `tests/integration/match-bet-summary.spec.ts` (T006).
- `tests/integration/match-settle-with-bet.spec.ts` (T008).
- `tests/component/record-result-beer-picker.spec.tsx` (T018).
- `tests/component/match-bet-module.spec.tsx` (T020).

No E2E layer additions — justified in plan.md.

---

## Notes

- [P] tasks = different files, no dependencies.
- Each task names the exact file it touches.
- Tests written BEFORE their implementation — verify they fail
  before writing the implementation task that makes them pass.
- Commit after each logical group (Foundational helpers,
  transaction rewrite, UI components, polish); trunk-based
  direct-to-main per constitution.
- T013 (reverseResultTx void cascade extension) is the most
  uncertain task — verify the existing implementation first.
  If today already voids consumptions transitively (unlikely but
  possible), T013 becomes a verification-only task.
- The catalog string tasks (T014/T015 + T016/T017) MUST land in
  pairs (en + cs together) so `i18n:check` stays green between
  commits.
