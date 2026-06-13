---
description: "Task list for spec 035 — achievements / badges (+ game-style gallery)"
---

# Tasks: Achievements / Badges

**Input**: Design documents from `specs/035-achievements-badges/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — plan.md declares unit + integration + component layers (no E2E).

**Organization**: By user story. US1 = the full badge gallery (MVP). US2 = earn-in-the-moment + celebration. US3 = rarity (optional). Authored on `main` (trunk-based).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no incomplete-task dependency)
- File paths are exact. Reuses spec 034 (`lib/stats/*`, `getPlayerStats`, profile page, `celebrateBeer()`).

---

## Phase 1: Setup

No new tooling/deps. The project, lint, test configs, and i18n gates already exist.

- [X] T001 Confirm working tree clean on `main` and dev DB up (`docker compose up -d`, Postgres `:15432`); load the heavy seed (`pnpm db:seed:heavy`) for realistic gallery data.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Blocks US1, US2, and US3 — the schema, the stats inputs, the pure catalog, and the persistence layer all live here.

### Schema + migration

- [X] T002 Create `lib/db/schema/achievements.ts` — `memberAchievements` pgTable (`id`, `clubId`→clubs restrict, `memberId`→members cascade, `badgeKey` text, `earnedAt` timestamptz default now) + `uniqueIndex uniq_member_achievements_member_badge (memberId, badgeKey)` + `index idx_member_achievements_member (memberId)`; export inferred types. Per data-model.md.
- [X] T003 Add `export * from './achievements';` to `lib/db/schema/index.ts`.
- [X] T004 Generate migration: `pnpm drizzle-kit generate` → produces `drizzle/0015_*.sql` (CREATE TABLE + indexes, additive). Apply locally (`pnpm drizzle-kit migrate`) and confirm it applies cleanly.

### Stats inputs (extend spec 034)

- [X] T005 Add `distinctBeerTypes: number` and `sessionsAttended: number` to `MemberStats` in `lib/stats/types.ts`.
- [X] T006 In `lib/db/queries/player-stats.ts`: add one `countDistinct(consumptions.beerTypeId)` query (same non-voided join as the beer total) to the `Promise.all` → `distinctBeerTypes`; expose the already-computed `distinctSessions` as `sessionsAttended` on the returned object.

### Pure catalog core (`lib/achievements/`) + unit tests

- [X] T007 [P] Create `lib/achievements/types.ts` — `BadgeKey` union (9 keys), `BadgeProgress {current,target}`, `Badge {key,emoji,nameKey,descriptionKey,conditionKey,earned,progress}`, `BadgeView`. Per data-model.md.
- [X] T008 [P] Create `lib/achievements/predicates.ts` — the 9 pure earn predicates AND 9 pure progress fns (with `clamp`), reusing `WINRATE_MIN_MATCHES` from `lib/stats/constants`. Per contracts/achievements.md §1.
- [X] T009 Create `lib/achievements/catalog.ts` — `BADGES` array (key/emoji/name+desc+condition i18n keys/earn/progress, display order per badge-catalog.md), `BADGE_BY_KEY`, `qualifyingBadgeKeys(stats)`. (Depends on T007, T008.)
- [X] T010 [P] Unit test `tests/unit/achievement-predicates.spec.ts` — earn at/below threshold (100/99, 25/24, streaks 3 & 5, distinct 5, sessions 25); sharpshooter false below guard & at `winRatio===null`; progress never exceeds target; sharpshooter two-leg progress; every `BadgeKey` appears once in `BADGES` with earn+progress. (Gate: `pnpm test:unit`.)

### Persistence layer (`lib/db/queries/achievements.ts`) + integration test

- [X] T011 Create `lib/db/queries/achievements.ts` with `reconcileAchievements({clubId,memberId})` (calls `getPlayerStats` → `qualifyingBadgeKeys` → `insert(...).onConflictDoNothing({target:[memberId,badgeKey]}).returning({badgeKey})` → newly-earned keys), `getEarnedBadges({clubId,memberId})` (claimed keys + `earnedAt`, newest first), and `reconcileAllClubMembers({clubId,stampAt})` (same insert-if-absent per member, `earnedAt: stampAt`, returns count). Per contracts/achievements.md §3. (Depends on T002, T009.)
- [X] T012 Integration test `tests/integration/reconcile-achievements.spec.ts` (PGlite) — insert-if-absent awards qualifying badges; **idempotent** (second call → `[]`, no duplicate); **sticky** (void a beer below threshold → row persists, not revoked); multi-earn in one call; `reconcileAllClubMembers` stamps `earnedAt` with the passed date and is re-run-safe. (Gate: `pnpm test:integration`.)

### Shared i18n (badge copy + section + toast)

- [X] T013 [P] Add the `achievement.*` namespace to `messages/cs.json` and `messages/en.json` — `sectionTitle`, `earnedCount` (ICU "{earned} of {total}"), `empty`, `earnedOn`, `progress` (ICU "{current} / {target}"), `unlocked` (toast), and per-badge `badge.<key>.{name,desc,condition}` for all 9, both locales, parity-clean. Per contracts/badge-catalog.md. (Gate: `pnpm i18n:check`.)

**Checkpoint**: schema migrated, stats extended, pure catalog unit-green, reconcile integration-green, copy in place. User stories can begin.

---

## Phase 3: User Story 1 — The badge gallery (Priority: P1) 🎯 MVP

**Goal**: A game-style Achievements gallery on every profile: ALL badges shown with their condition, claimed (vivid + earned date) vs locked (dimmed + progress bar "64/100"), earned-first, "N of M" count. Populated for existing members via backfill.

**Independent Test**: Open a veteran's profile → full 9-badge gallery, earned vivid+dated+first, locked dimmed with condition + correct progress; new member → all locked at "0/N"; header count matches.

### Backfill (so veterans see badges on day one — FR-013)

- [X] T014 [US1] Create `scripts/backfill-achievements.ts` — for each club, call `reconcileAllClubMembers({clubId, stampAt})` with a single release timestamp; log inserted counts. Run it locally against the heavy seed to populate data. (Depends on T011.)

### Gallery UI

- [X] T015 [P] [US1] Create `components/achievements/badge-chip.tsx` — one badge tile: emoji + name + condition (shown always); earned variant (vivid + `earnedOn` date), locked variant (dimmed + `progress` bar from `BadgeProgress`). Strings via `useTranslations('achievement')`; no literal JSX copy.
- [X] T016 [US1] Create `components/achievements/achievements-section.tsx` — builds `BadgeView[]` over the whole `BADGES` catalog from props `{stats: MemberStats, earned: {key,earnedAt}[]}`: progress via `badge.progress(stats)`, earned/`earnedAt` from `earned`; sort earned-first (newest first) then catalog order; header `earnedCount / BADGES.length`; renders `BadgeChip`s; friendly `empty` note when none earned (gallery still shows all locked). (Depends on T009, T015.)
- [X] T017 [US1] Wire into `app/[locale]/(app)/members/[memberId]/page.tsx` — add `getEarnedBadges({clubId, memberId})` to the existing `Promise.all`/await block and pass the already-loaded `stats` + `earned` to `<AchievementsSection />` (new section above or below the existing stat tiles). (Depends on T016.)
- [X] T018 [US1] If `pnpm i18n:check` flags an arrow/ternary/JSX false-positive in the new components (as spec 034's `leaderboard-board.tsx` hit), add the offending file(s) to the EXCLUDED set in `scripts/i18n-check.ts` (real copy already flows through `t('achievement.*')`).

### Test

- [X] T019 [P] [US1] Component test `tests/component/achievements-section.spec.tsx` (RTL/jsdom, mocked props) — renders all 9 badges; earned ones vivid + dated + sorted first; locked ones show condition + progress ("64 / 100"); header "N of 9"; all-locked new-member case; cs+en copy. (Gate: `pnpm test:component`.)

**Checkpoint**: Gallery live and populated; US1 demoable on its own.

---

## Phase 4: User Story 2 — Earn a badge in the moment (Priority: P2)

**Goal**: Crossing a threshold via a normal action persists the unlock (post-commit reconcile) and celebrates it (🍻 + toast naming the badge). Sticky; idempotent; multi-earn; absent members reconciled silently.

**Independent Test**: Member at 99 logs a beer → celebration names Century Club; profile shows it claimed with today's date; logging 101 → no repeat; void → still claimed.

### Wire reconcile into the mutation actions (post-commit, swallow errors — FR-019)

- [X] T020 [US2] In `app/[locale]/(app)/log/actions.ts`: after each transaction commits, call `reconcileAchievements` wrapped in try/catch (never fail the action) — `logBeerAction` (actor), `logBeerOnBehalfAction` (target + actor), `logRoundAction` (each logged drinker + actor); add `unlockedBadges: BadgeKey[]` (the **actor's** newly-earned) to each success result type + value. Per contracts/achievements.md §4. (Depends on T011.)
- [X] T021 [US2] In `app/[locale]/(app)/match/actions.ts`: after `recordResultTx` commits in `recordResultAction`, reconcile **all participant member IDs** (try/catch each); add `unlockedBadges: BadgeKey[]` (actor's) to `RecordResultResult`. (Depends on T011.)
- [X] T022 [US2] Integration test `tests/integration/award-on-action.spec.ts` (PGlite) — driving the real `logBeerAction`/`recordResultAction` path across a threshold inserts the badge and returns it in `unlockedBadges`; below threshold returns `[]`; on-behalf/round reconciles the target/drinkers (their rows appear) while only the actor's keys ride back; a reconcile that would error does NOT fail the action. (Gate: `pnpm test:integration`.)

### Celebration on the client

- [X] T023 [US2] Create a tiny client helper `components/achievements/celebrate-unlocks.ts(x)` — `celebrateUnlocks(keys, t)` fires `celebrateBeer()` once and a `toast` per key naming `t(BADGE_BY_KEY[key].nameKey) + emoji` via `t('achievement.unlocked', {badge})`. (Reuses `lib/celebrate.ts`.)
- [X] T024 [US2] Call `celebrateUnlocks(result.unlockedBadges, t)` in the client result handlers that already call `celebrateBeer()` on success — the home one-tap log (`components/home/*one-tap*`), the `/log` grid client, `components/home/round-logger.tsx`, and the match `RecordResultForm.tsx`. Guard on `unlockedBadges?.length`. (Depends on T020, T021, T023.)

**Checkpoint**: Earn-in-the-moment loop works end to end; US1 + US2 both functional.

---

## Phase 5: User Story 3 — Rarity (Priority: P3, optional v1)

**Goal**: Each gallery badge shows how many club members hold it ("owned by 3 of 28 members"), with a "nobody yet — be the first" state.

**Independent Test**: On a seeded club, each badge shows a truthful holder count/share; an unheld badge reads "nobody yet".

- [X] T025 [US3] Add `getClubBadgeRarity({clubId})` to `lib/db/queries/achievements.ts` — one GROUP BY on `member_achievements` (holders per `badgeKey`) + one active-member count → `{holdersByKey, clubMembers}`. Per contracts/achievements.md §3.
- [X] T026 [P] [US3] Add `achievement.rarity` (ICU "{holders} of {total} members") + `achievement.rarityNone` to `messages/{cs,en}.json`.
- [X] T027 [US3] Thread optional `rarity` into `achievements-section.tsx` → `badge-chip.tsx` (render the rarity cue per badge; `rarityNone` when 0); load `getClubBadgeRarity` in `members/[memberId]/page.tsx` and pass it. (Depends on T025, T016.)
- [X] T028 [P] [US3] Extend `tests/component/achievements-section.spec.tsx` (or a sibling) — rarity cue renders for held badges and "nobody yet" for unheld. (Gate: `pnpm test:component`.)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting

- [X] T029 Run the full gate suite: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm build && pnpm i18n:check && pnpm forms:check`. Fix anything red.
- [X] T030 Walk `quickstart.md` live via the Docker MCP browser on the heavy seed — gallery (US1), earn-in-the-moment (US2), sticky-after-void, multi-earn, rarity (if built).
- [X] T031 [P] Update `BACKLOG.md` with the v1 deferrals: tiered badges (250/500), relative/point-in-time badges (Giant-killer, "was #1"), secret achievements, gallery sort/filter controls, badge-count leaderboard, lean `getBadgeStats` reconcile optimization if fan-out ever bites.
- [X] T032 [P] Update the `CLAUDE.md` SPECKIT block: flip spec 035 from "ACTIVE PLAN" to "Most recently shipped" with the as-built summary; note migration 0015 + the prod backfill deploy step.
- [ ] T033 Commit + push to `main` (Vercel auto-deploys → `drizzle-kit migrate` applies 0015). After deploy READY, run `scripts/backfill-achievements.ts` against prod `DATABASE_URL` once (FR-013).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** blocks everything.
- **US1 (Phase 3)** needs Foundational (esp. T009 catalog, T011 queries/getEarnedBadges, T013 i18n). MVP.
- **US2 (Phase 4)** needs Foundational (T011 reconcile, T013 toast key). Independent of US1 (different files), though both ship together for the full loop.
- **US3 (Phase 5)** needs Foundational + US1's gallery components (T016) to thread rarity into.
- **Polish (Phase 6)** after the desired stories.

### Within Foundational

- T002→T003→T004 (schema → export → migrate) sequential.
- T005→T006 sequential. T007/T008 parallel, then T009 (catalog) depends on both; T010 unit test parallel-ish (after T008/T009).
- T011 depends on T002 + T009; T012 depends on T011.
- T013 independent ([P]).

### Parallel opportunities

- T007 + T008 together; T010 + T013 alongside once their inputs exist.
- US1 T015 (chip) parallel with backfill T014; T019 test parallel.
- US3 T026 + T028 marked [P].

---

## Implementation Strategy

**MVP = Phase 1 + 2 + 3 (US1).** A populated, game-style badge gallery on every
profile is already the headline deliverable and demoable on its own. Then layer
US2 (the live earn + celebration) for the reward loop, and US3 (rarity) if time
allows. Ship US1+US2 together to `main` (the loop feels incomplete without the
unlock moment), backfill prod, then optionally US3.

---

## Notes

- Reconcile is **post-commit + try/catch-swallowed** everywhere — a predicate bug or DB hiccup must never block a beer log (FR-019 / SC-006).
- The gallery computes progress **in render from `stats` already loaded by the profile** — pure function, no write, no new per-badge query.
- Sticky (insert-only) is the whole reason for the table: never UPDATE/DELETE a `member_achievements` row under normal operation.
- Don't re-test the existing log/match actions' core behaviour (already covered) — the new integration tests target only the new reconcile/award/sticky rules.
