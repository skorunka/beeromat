---
description: "Task list for spec 019 — Log a beer on behalf of another member + /tab expansion"
---

# Tasks: Log a beer on behalf of another member

**Input**: Design documents from `/specs/019-log-for-other-member/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`,
`data-model.md`, `contracts/log-on-behalf-tx.md`,
`contracts/review-banner.md`, `quickstart.md` — all complete.

**Tests**: Integration + Component REQUIRED per Constitution
v1.10.0 Principle VIII test layer declaration. No unit (no pure
functions). No E2E (no new multi-system seam).

**Organization**: Grouped by user story per Constitution Spec/Task
Discipline. Note: US3 in spec.md is treasurer audit; in this
tasks file we merge the user's follow-up "see what was logged by
whom and what I won/lost on /tab" requirement into the same
phase (it's the same surface — row distinction).

## Format: `[ID] [P?] [Story] Description`

Same conventions as prior specs.

## Path Conventions

Next.js App Router monorepo. Paths from repo root.

---

## Phase 1: Setup

- [ ] T001 Ensure `app/[locale]/(app)/log/for/` directory exists (auto-created when the first file is written under it in Phase 3).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration + new query helpers all user
stories depend on.

**⚠️ CRITICAL**: No US-phase task can land before Phase 2 is green.

- [ ] T002 Generate Drizzle migration adding nullable column `consumptions.on_behalf_reviewed_at timestamp with time zone`. Run `pnpm db:generate` to produce `drizzle/0010_*.sql`. Apply via `pnpm db:migrate` against the local dev DB to verify.
- [ ] T003 Update `lib/db/schema/consumption.ts` adding the new column to the `consumptions` table definition with the same shape Drizzle generated. Verify `pnpm typecheck` stays green.
- [ ] T004 [P] Integration test for the new query helper in `tests/integration/on-behalf-review.spec.ts`. Cases: (a) returns `{ count: 0, rows: [] }` when no on-behalf consumptions exist; (b) returns one row when a member has an unreviewed on-behalf consumption with `created_by_user_id <> their user_id`; (c) excludes voided consumptions; (d) excludes already-reviewed rows (`on_behalf_reviewed_at IS NOT NULL`); (e) excludes self-logged consumptions even if `created_by_user_id <> member.user_id` happens (shouldn't happen but the query must filter); (f) scopes by club_id. Test MUST fail until T005.
- [ ] T005 Implement `onBehalfReviewSummaryForMember(memberId, clubId)` in `lib/db/queries/on-behalf-review.ts` per the SQL shape in `data-model.md`. Joins `consumptions` ← `user` (logger) ← `beer_types`, LEFT JOIN `consumption_voids`, filtered by `member_id`, `club_id`, `created_by_user_id <> (member's user_id)`, `on_behalf_reviewed_at IS NULL`, `consumption_voids.id IS NULL`. Returns `{ count, rows: [{ consumptionId, loggerDisplayName, beerName, createdAt }] }`.

### Authz extension (F1 from /speckit-analyze) — blocks US2

The existing `voidConsumptionAction` authz today is `(isLogger && inWindow) OR hasOverride(stock_manager)`. The absent member (consumer) is neither the logger nor a stock_manager, so they CANNOT void their own on-behalf log via the current action — which breaks US2's reject path.

- [ ] T005a Integration test in `tests/integration/void-on-behalf-authz.spec.ts`. Cases: (a) absent member CAN void an on-behalf log made for them (the new path); (b) absent member CANNOT void a self-logged consumption outside the undo window (existing constraint preserved — the new authz clause only opens for on-behalf rows); (c) absent member CANNOT void another member's self-logged consumption (cross-member safety preserved). Test MUST fail until T005b.
- [ ] T005b Extend `voidConsumptionAction` in `app/[locale]/(app)/log/actions.ts`. Add a new authz clause: the consumer (`ctx.user.id` matches `consumption.member`'s user_id) may void IF the consumption is an on-behalf log (`consumption.createdByUserId !== consumer's user_id`). Indefinite — no undo window for on-behalf rejects, per FR-006. Other paths (isLogger+window, stock_manager override) preserved. Document the new clause in the action's comment block.

**Checkpoint**: Migration applied + query helper green + authz extended → US phases unblocked.

---

## Phase 3: User Story 1 — Present member logs on behalf (Priority: P1) 🎯 MVP

**Goal**: A present member taps "Log for someone else", picks an
absent member + beer, confirms. A consumption row appears on the
absent member's tab attributed to the present member.

**Independent Test**: As Pavel, open `/`, tap "Zapsat pro
jiného člena", pick Honza, pick Pilsner, submit. Verify a
`consumptions` row with `member_id = Honza.id`,
`created_by_user_id = Pavel.user_id`, `unit_price_minor_snapshot =
beer.unit_price_minor`. Stock decremented by 1; `stock_changes`
audit row written.

### Catalog strings (US1)

- [ ] T006 [P] [US1] Add `log.onBehalf.ctaLink` ("Zapsat pro jiného člena" / "Log for someone else"), `log.onBehalf.title` ("Komu zapíšeš?" / "Logging for…"), `log.onBehalf.memberHint` ("Vyber člena" / "Pick a member"), `log.onBehalf.submitCta` ("Zapsat {beer} pro {member}" / "Log {beer} for {member}"), `log.onBehalf.toastLogged` ("Zapsáno: {beer} pro {member}" / "Logged: {beer} for {member}"), `log.onBehalf.toastError` ("Nepodařilo se zapsat. Zkus to znovu." / "Couldn't log. Try again."), `log.onBehalf.errors.targetSelf` ("Sám sobě piva přes tuhle cestu nezapisuj." / "Use the regular log button for yourself."), `log.onBehalf.errors.targetNotInClub` ("Tohoto člena tu nemáme." / "That member isn't in this club.") to `messages/en.json`. No "dlužíš" anywhere.
- [ ] T007 [P] [US1] Same keys in `messages/cs.json`. Czech values from the bullet above.

### Integration test for US1 (REQUIRED — write before T009)

- [ ] T008 [US1] Integration test for `logBeerOnBehalfAction` in `tests/integration/log-on-behalf-tx.spec.ts`. Cases: (1) happy path — consumption + stock decrement + audit; assert `member_id = target`, `created_by_user_id = actor`; (2) actor tries to log for themselves → `TARGET_IS_SELF`; (3) actor tries to log for a member of a different club → `TARGET_NOT_IN_CLUB`; (4) target member is inactive → `TARGET_NOT_IN_CLUB`; (5) beer is out of stock → `OUT_OF_STOCK`; (6) beer is archived → `BEER_NOT_AVAILABLE`; (7) no open session → auto-opens one. Tests MUST fail until T009 + T010.

### Implementation (US1) — action + Zod

- [ ] T009 [US1] Add `logBeerOnBehalfSchema` to `lib/validation/log.ts` (or create the file if missing): `z.object({ beerTypeId: z.string().uuid(), targetMemberId: z.string().uuid() })`. Export `LogBeerOnBehalfInput`.
- [ ] T010 [US1] Implement `logBeerOnBehalfAction` in `app/[locale]/(app)/log/actions.ts`. New result type per `contracts/log-on-behalf-tx.md`. Transaction body: validate target (in active club, not self, active), validate beer (in club, not archived, in stock), get-or-open session, insert consumption (member_id=target, created_by_user_id=actor), decrement stock + write `stock_changes` audit row. Return `{ ok: true, consumptionId, targetMemberId }` or the appropriate failure code. Reuses the same insert logic as `logBeerAction` — extract into a shared helper if the duplication is too much.

### Implementation (US1) — UI

- [ ] T011 [US1] Create `components/log/log-for-other-link.tsx` — small client component that renders a `<Link>` styled as a muted text link with text from `t('log.onBehalf.ctaLink')`. `href` defaults to `/log/for` (Next.js `Route`). Accepts an optional `className` prop for placement-specific styling. Renders only when the prop `hasOtherMembers === true` (else returns null).
- [ ] T012 [US1] Create `app/[locale]/(app)/log/for/page.tsx` — server component that loads the catalog (active in-stock beers) + active members in the club (excluding the actor) + the predictive default beer for the picked target (resolved lazily client-side via spec-017's `lastBeerForMember`). Renders `<LogOnBehalfForm>` with the catalog + members as props. If members.length === 0, render an empty-state message + Link back to `/log`.
- [ ] T013 [US1] Create `components/log/log-on-behalf-form.tsx` (`'use client'`). Two-step form: member-picker (select or radio list of active members) → beer-picker (grid of in-stock beers). When the member is picked, the predictive default beer is highlighted (calls `lastBeerForMember(member.id, club.id)` via a new server-action wrapper OR is pre-computed for each member as a prop). On submit, call `logBeerOnBehalfAction({ beerTypeId, targetMemberId })`. On success: toast `t('log.onBehalf.toastLogged', { beer, member })` + router.push back to `/`. On error: toast the appropriate error string.

### Wire the affordance into existing surfaces (US1)

- [ ] T014 [US1] Modify `app/[locale]/(app)/page.tsx` — add `<LogForOtherLink hasOtherMembers={ctx.club.activeMemberCount > 1} className="self-center" />` below the existing `<HomeOneTapLog />`. The `hasOtherMembers` check requires a small new field on the home query (count of active members != self); add it inline or via a new tiny query.
- [ ] T015 [US1] Modify `app/[locale]/(app)/log/page.tsx` — append `<LogForOtherLink hasOtherMembers={...} />` at the bottom of the catalog grid (below the beer-types list, before any "go back" buttons).

**Checkpoint US1**: Pavel can log for Honza end-to-end. Integration
tests + component tests for the form variants green.

---

## Phase 4: User Story 2 — Absent member reviews on-behalf logs (Priority: P1)

**Goal**: When Honza opens `/`, his home shows a review banner
listing every on-behalf log made for him since his previous
review. One-tap "Vrátit" voids the consumption + restores stock;
one-tap "Nechat" dismisses the banner without voiding.

**Independent Test**: Pavel logs Pilsner for Honza (via Phase 3
path). Honza opens `/`. Banner renders "Pavel ti zapsal: Pilsner"
with [Vrátit] [Nechat]. Tap Nechat → banner gone, consumption
stays + `on_behalf_reviewed_at` is set. Reset; tap Vrátit →
consumption voided + stock restored + banner gone.

### Catalog strings (US2)

- [ ] T016 [P] [US2] Add `home.onBehalfReview.one` ("{logger} ti zapsal: {beer}" / "{logger} logged for you: {beer}"), `home.onBehalfReview.heading` ("Zápisy pro tebe" / "Logged for you"), `home.onBehalfReview.reject` ("Vrátit" / "Reverse"), `home.onBehalfReview.keep` ("Nechat" / "Keep") to `messages/en.json`. No "dlužíš".
- [ ] T017 [P] [US2] Same keys in `messages/cs.json`.

### Integration test for US2 (REQUIRED — write before T019)

- [ ] T018 [US2] Integration test for `dismissOnBehalfReviewAction` in `tests/integration/on-behalf-dismiss.spec.ts`. Cases: (a) happy path — stamps `on_behalf_reviewed_at = now()`; (b) authz — a non-consumer member trying to dismiss returns `NOT_AUTHORIZED`; (c) already-reviewed row returns `ALREADY_REVIEWED` (idempotent UX); (d) consumption doesn't exist → `NOT_FOUND`. Tests MUST fail until T019.

### Implementation (US2) — action

- [ ] T019 [US2] Implement `dismissOnBehalfReviewAction` in `app/[locale]/(app)/log/actions.ts` (or a new `app/[locale]/(app)/account/actions.ts` if scope clearer there). Input: `{ consumptionId }`. Resolve consumption → member → user; verify against `ctx.user.id`. UPDATE consumptions SET `on_behalf_reviewed_at = now()` WHERE id = $1 AND member_id = (active member) AND `on_behalf_reviewed_at IS NULL`. Return `{ ok: true }` or appropriate failure.

### Component test for US2 (REQUIRED — write before T021)

- [ ] T020 [US2] Component test for `<OnBehalfReviewBanner />` in `tests/component/on-behalf-review-banner.spec.tsx`. Cases: V1 (count===0) renders null; V2 (one row) shows logger + beer + [Vrátit] [Nechat]; V3 (multi) shows the list; tap Nechat calls `dismissOnBehalfReviewAction` only; tap Vrátit calls `voidConsumptionAction` + `dismissOnBehalfReviewAction`. Mock both actions via `vi.mock()`. Tests MUST fail until T021.

### Implementation (US2) — UI

- [ ] T021 [US2] Create `components/home/on-behalf-review-banner.tsx` — `'use client'` component. Props: `{ rows: Array<{ consumptionId, loggerDisplayName, beerName, createdAt }> }`. Renders null when `rows.length === 0`. Otherwise renders a `<Card>` with the heading + one sub-row per row, each with the message + two buttons. Uses `useTransition` for both actions + sonner toasts on success/failure + `router.refresh()` after each.

### Wire banner into home (US2)

- [ ] T022 [US2] Modify `app/[locale]/(app)/page.tsx` — add `onBehalfReviewSummaryForMember(ctx.member.id, ctx.club.id)` to the existing `Promise.all`. Render `<OnBehalfReviewBanner rows={summary.rows} />` ABOVE the `<MatchBetModule />`. The banner returns null when count is 0, so no visual change for members with no on-behalf rows.

**Checkpoint US2**: Honza sees the banner + can review.

---

## Phase 5: User Story 3 + /tab origin-row expansion (Priority: P2)

**Goal**: `/tab` and the admin balance audit view distinguish
all four origin types: self-logged, on-behalf (with "od
{logger}"), won-bet (existing "ze zápasu →"), and lost-bet
(new `transfer_in` row with "z prohrané sázky" copy + match
link).

**Independent Test**: Set up Honza with 2 self-logs + 1
on-behalf log from Pavel + 1 lost-bet to Pavel. Open `/tab` as
Honza. Verify the four row treatments are visible + each row's
attribution matches.

### Catalog strings (US3)

- [ ] T023 [P] [US3] Add `tab.byOther` ("od {logger}" / "by {logger}") and `tab.fromBet` ("z prohrané sázky: {logger} · {beer}" / "lost bet: {logger} · {beer}") to `messages/en.json`. Keep existing `tab.fromMatch` from spec-018 follow-up.
- [ ] T024 [P] [US3] Same keys in `messages/cs.json`.

### Integration test for US3 (REQUIRED — write before T026)

- [ ] T025 [US3] Integration test in `tests/integration/tab-entries-merged.spec.ts`. Cases: (a) member with only self-logs returns all rows with `kind='consumption'` and `loggerDisplayName === null`; (b) member with on-behalf logs returns those entries with `loggerDisplayName !== null`; (c) member who lost a bet returns extra `kind='transfer_in'` rows with `sourceMatchId`; (d) sum of all row prices equals the member's `memberBalance()` total; (e) chronological merge (newest first across kinds); (f) voided rows / voided transfers excluded. Tests MUST fail until T026.

### Implementation (US3) — extended query

- [ ] T026 [US3] Extend `MemberTabEntry` interface in `lib/db/queries/consumption.ts` with `loggerDisplayName: string | null` field and ensure the existing `sourceMatchId` field (from spec-018 follow-up) is preserved. Update `getMyTabForSession` to: (a) for the existing consumption query, LEFT JOIN to user table for `created_by_user_id` and populate `loggerDisplayName` when it differs from the consumer's user; (b) NEW: query `bet_transfers WHERE to_member_id = $1 AND club_id = $2 AND not voided` joined to source consumption → beer + matchBetTransfers → matches; emit as `kind='transfer_in'` entries with full beer name + sourceMatchId + loggerDisplayName (the FROM member's name as the "owed-to") + the cost as `unitPriceMinor`. Merge both arrays and sort by `createdAt DESC`. Recompute `totalMinor` over the merged list.

### Component tests (US3 — UI variants)

- [ ] T027 [US3] Component test in `tests/component/tab-entry-row.spec.tsx`. Render each of the four entry types via `<TabEntryRow entry={...} />` (extract row rendering into a small component for testability — see T028). Cases: self-log → no badges; on-behalf → "od Pavel" subtitle; consumption with sourceMatchId → "ze zápasu →" subtitle; transfer_in → distinct row layout with "z prohrané sázky" text + match link. Each in cs + en.

### Implementation (US3) — /tab UI

- [ ] T028 [US3] Extract row rendering from `app/[locale]/(app)/tab/page.tsx` into a new `components/tab/tab-entry-row.tsx` component. Server component. Props: `{ entry: MemberTabEntry, currencyCode, locale }`. Handles the four-variant rendering per `contracts/review-banner.md`. The page calls it in a map.

**Checkpoint US3**: /tab shows the full audit story for Standa
and Jiří. Note: admin balance view (`/admin/balances/[memberId]`)
is left for a follow-up; the queries there may need similar
extension but it's smaller scope.

---

## Phase 6: Polish & ship

- [ ] T029 [P] Nag-tone audit: `grep -rE "dluž" messages/ app/[locale]/\(app\)/` MUST return empty.
- [ ] T030 [P] Update `BACKLOG.md`: mark "Log a beer on behalf of another member" as shipped with the spec 019 reference, similar to how 017 and 018 were marked.
- [ ] T031 Run all 8 verification gates: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm build && pnpm i18n:check && pnpm forms:check`. All MUST pass before commit.
- [ ] T032 Run quickstart.md paths 1-5 manually.
- [ ] T033 Mark spec.md status `Shipped (YYYY-MM-DD)`. Update CLAUDE.md SPECKIT marker to "No spec currently in flight" (or to the next active spec). Commit + push.

---

## Dependencies & Execution Order

### Phase order

1. Phase 1 — T001. Trivial.
2. Phase 2 — T002-T005. Migration + query helper.
3. Phase 3 (US1) — depends on Phase 2.
4. Phase 4 (US2) — depends on Phase 2 + 3 (the banner needs on-behalf logs to exist).
5. Phase 5 (US3) — depends on Phase 3 + 4 (extends /tab to show on-behalf attribution).
6. Phase 6 — depends on all above.

### Recommended linear order (single developer)

T001 → T002 → T003 → T004 ‖ T005 →
T006 ‖ T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 ‖ T015 →
T016 ‖ T017 → T018 → T019 → T020 → T021 → T022 →
T023 ‖ T024 → T025 → T026 → T027 → T028 →
T029 ‖ T030 → T031 → T032 → T033.

### Parallel opportunities

- T004 ‖ T005 (test-first split).
- Catalog pairs: T006 ‖ T007; T016 ‖ T017; T023 ‖ T024.
- T014 ‖ T015 (different files; same component).
- T029 ‖ T030.

---

## Implementation Strategy

### MVP scope = Phase 1-3 (US1 only)

Phase 3 alone is shippable: a present member can log on behalf
of another. Banner + /tab expansion come in subsequent phases.

### Incremental delivery

- After Phase 3: Pavel can log for Honza; Honza sees it on /tab
  but no proactive notification + no special row distinction.
  Shippable as "log-for-other v0".
- After Phase 4: Honza gets the home banner + reject path.
- After Phase 5: /tab carries the full origin-row distinction
  for all four kinds.
- After Phase 6: gates green, BACKLOG marked, spec shipped.

### Constitution v1.10.0 Test Layer Declaration (recap)

- Integration: `tests/integration/on-behalf-review.spec.ts` (T004),
  `tests/integration/log-on-behalf-tx.spec.ts` (T008),
  `tests/integration/on-behalf-dismiss.spec.ts` (T018),
  `tests/integration/tab-entries-merged.spec.ts` (T025).
- Component: `tests/component/on-behalf-review-banner.spec.tsx`
  (T020), `tests/component/tab-entry-row.spec.tsx` (T027). The
  picker form is exercised by integration via the action; if
  the form's interaction surface grows, add `tests/component/log-on-behalf-form.spec.tsx`.
- No unit / no E2E (justified in plan.md).

---

## Notes

- [P] tasks = different files, no dependencies.
- Each task names the exact file it touches.
- Tests written BEFORE implementation per Principle VIII; verify
  failure before the impl task.
- Catalog pairs MUST land together so `i18n:check` stays green
  between commits.
- The `lastBeerForMember(target, club)` lookup in T013 calls
  through the spec-017 helper; the helper already supports being
  invoked from a Server Action via the optional `tx` argument we
  added in spec 018.
