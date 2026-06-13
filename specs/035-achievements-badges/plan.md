# Implementation Plan: Achievements / Badges

**Branch**: `main` (trunk-based) | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-achievements-badges/spec.md`

## Summary

A persistent, sticky badge layer on top of spec 034's per-member stats. One new
table (`member_achievements`) records which member holds which badge and when it
was first earned; the **badge catalog lives in code** (`lib/achievements/`), not
in DB rows. Badges are recognised **at write-time** — a shared
`reconcileAchievements(memberId)` runs at the end of the existing mutation
actions that change the relevant stats (log beer / on-behalf / round, record
match result), computing the member's currently-qualifying badge set from
`getPlayerStats` and inserting any not-yet-held rows (insert-if-absent). Earning
is **sticky** (a later void/reverse never revokes). The actor's newly-earned
badges are returned to the client so it can fire the existing 🍻 celebration +
name the badge in a toast. A one-off backfill pass awards historical earns to
all existing members at release, stamped with a single release timestamp so they
don't read as "just unlocked". The `/members/[memberId]` profile gains a game-style
**Achievements gallery** (the headline, per the follow-up direction): it shows the
**whole** badge catalog — every badge with its unlock condition — marking which are
claimed (vivid, with the earned date) vs locked (dimmed, with a progress bar like
"64 / 100"), earned sorted to the top, with an "N of M" header count. Progress is a
pure function over the member's stats (which the profile already loads), so the
gallery needs no new per-badge query. An optional rarity cue ("owned by 3 of 28
members", P3) adds one club-wide count.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node 24 LTS

**Primary Dependencies**: Next.js 16 (App Router, server actions), React 19.2,
Drizzle ORM 0.45.x + Drizzle Kit 0.31.x, `@neondatabase/serverless`, next-intl
v4 (cs/en). Reuses spec 034: `getPlayerStats`, `lib/stats/*` selectors,
`MemberStats`, `MemberAvatar`, the profile page, and `celebrateBeer()`.

**Storage**: Neon Postgres. One additive table + migration **0015** (last was
0014). No change to any existing table.

**Testing**: Vitest unit (pure predicates) + Vitest/PGlite integration (reconcile
+ sticky behaviour) + Vitest/RTL component (the Achievements section). No E2E.

**Target Platform**: Mobile-first PWA, club-scoped, cs/en.

**Project Type**: Web app (Next.js App Router monorepo-style single project).

**Performance Goals**: `reconcileAchievements` is one member's aggregate compute
(reusing `getPlayerStats`, ~10 bounded indexed queries) + a single insert-if-absent.
It runs only on the mutation paths that already do DB work, post-commit, and must
add no perceptible latency at clubhouse scale (~50 members). Backfill is a bounded
one-pass over all members.

**Constraints**: Reconcile MUST NOT run during a page render (no write-on-read).
Reconcile MUST NOT cause the underlying action to fail if it errors (wrap +
swallow + log). All v1 badge conditions MUST be derivable from `MemberStats`.

**Scale/Scope**: One new lib dir, one schema file + migration, ~9-badge catalog,
one reconcile helper + query, edits to 4 existing action files, one profile
section + component, a backfill script, i18n keys, tests in 3 layers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — ✅ The Achievements section is a thumb-friendly grid;
  no desktop-only interaction. Unlock celebration reuses the existing overlay
  (motion-reduce gated already).
- **II. Tenant-Aware Schema, Single-Club UX** — ✅ `member_achievements` carries
  `club_id` (FK) like every domain row. Reconcile + queries are club-scoped. No
  cross-club surface. Catalog is code config, not per-club DB config (it is not
  tenant-scoped settings — it's the fixed v1 feature definition), consistent with
  spec 034 keeping thresholds in `lib/stats/constants.ts`.
- **III. Track, Don't Transact** — ✅ No money. Badges are derived from existing
  consumption/match data.
- **IV. Auth** — ✅ No change. Reconcile runs inside already-authenticated
  actions; the profile is behind `requireUnlocked()`.
- **V. Auditable History (No Hard Deletes)** — ✅ `member_achievements` is
  **append-only** by design: `earned_at` is set once, rows are never updated or
  deleted under normal operation (sticky). This is stricter than the
  compensating-row rule — there is nothing to compensate because nothing is ever
  un-earned. No reversibility UI is owed (a badge is not an action a user
  performs and would expect to undo; it's a recognition).
- **VI. Free-Tier First** — ✅ One small table, bounded queries. No new infra.
- **VII. Fresh Code Hygiene** — ✅ No dependency changes. (Will run `pnpm
  outdated` awareness at implement time per the rolling rule, but no bumps are
  part of this feature.)
- **VIII. Testing Pyramid** — ✅ See declaration below.
- **Spec & Task Discipline** — ✅ Tasks will be verifiable via the gates
  (typecheck/lint/unit/integration/component/i18n/forms). Backfill correctness is
  an acceptance scenario verified by an integration test on a seeded club.
- **Test/Prod Separation** — ✅ No test-only branches in prod source. The backfill
  is a script under `scripts/`, not a prod code path; the heavy seed extension (if
  any) stays under `scripts/`.

**No violations. Complexity Tracking table not required.**

### Test layer declaration

*Required by Principle VIII.*

- **Unit (`pnpm test:unit`)** — **Yes.** The badge earn predicates AND progress
  functions are pure over `MemberStats` (`lib/achievements/predicates.ts`) — the
  natural home, like spec 034's `lib/stats/*` selectors. Catalog shape (every badge
  has earn + progress + name/desc/condition keys) is unit-assertable; progress
  clamping (never exceeds target; sharpshooter's two-leg progress) is unit-tested.
  This is the bulk of the coverage.
- **Integration (`pnpm test:integration`)** — **Yes.** `reconcileAchievements`
  is new DB-coupled logic: insert-if-absent, returns newly-earned keys, idempotent
  on re-run (no duplicate, no re-celebrate), and **sticky** (a void that lowers
  the stat does not remove the row). These are the genuinely new DB rules and the
  highest-value tests. PGlite, no live Neon. Per the "test only what deserves it"
  guidance, this is exactly the kind of new DB rule that warrants integration
  coverage; the existing log/match actions are NOT re-tested (already covered).
- **Component (`pnpm test:component`)** — **Yes.** The Achievements gallery renders
  ALL badges from a mocked `{stats, earned}`: earned ones vivid + dated and sorted
  first, locked ones dimmed with condition + progress ("64 / 100"), the "N of M"
  header count, the all-locked new-member case, and cs/en copy. RTL + jsdom, mocked
  props (no DB).
- **E2E (`pnpm test:e2e`)** — **N/A.** This feature is read-display + a write-time
  side-effect folded into already-E2E-untested actions; it is not itself a new
  user journey with an auth/persistence spine that only E2E can verify. The
  earn→celebrate→persist→display loop is fully covered by the integration test
  (persist/sticky/idempotent) + the component test (display) + unit (predicates).
  Adding a Playwright journey here would re-light the dormant E2E rig for a
  non-journey feature — not warranted (consistent with the project's
  dev-velocity-over-coverage direction and Principle VIII's "only-presentational
  or only-logic → no E2E" carve-out; this is both, not a journey).

## Project Structure

### Documentation (this feature)

```text
specs/035-achievements-badges/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — member_achievements + catalog shape
├── quickstart.md        # Phase 1 — how to verify locally
├── contracts/
│   ├── achievements.md  # reconcile + predicate + action-result contracts
│   └── badge-catalog.md # the v1 badge set + i18n key contract
├── checklists/
│   └── requirements.md  # spec quality checklist (done)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
lib/achievements/
├── catalog.ts           # NEW — BADGE catalog: key, emoji, name/desc/condition i18n keys,
│                        #       earn predicate, progress fn. Source of truth (code, not DB).
├── predicates.ts        # NEW — pure earn (=> boolean) + progress (=> {current,target}) per badge. Unit-tested.
└── types.ts             # NEW — BadgeKey union, BadgeProgress, Badge, BadgeView types.

lib/db/schema/
└── achievements.ts      # NEW — member_achievements pgTable (club_id, member_id, badge_key, earned_at) + unique.

lib/db/schema/index.ts   # EDIT — export * from './achievements'.

lib/db/queries/
└── achievements.ts      # NEW — reconcileAchievements(memberId) (insert-if-absent → newly-earned keys);
                         #       getEarnedBadges(clubId, memberId) (claimed keys + dates, for the gallery);
                         #       getClubBadgeRarity(clubId) (US3, optional — holders per key + member count);
                         #       reconcileAllClubMembers(clubId, stampAt) (backfill helper).

lib/stats/types.ts       # EDIT — add distinctBeerTypes + sessionsAttended to MemberStats.
lib/db/queries/player-stats.ts  # EDIT — populate the two new aggregates (one new countDistinct;
                                #        expose the already-computed distinct-session count).

app/[locale]/(app)/log/actions.ts     # EDIT — call reconcile after commit in
                                       #        logBeerAction / logBeerOnBehalfAction / logRoundAction;
                                       #        return unlockedBadges (actor) in the result.
app/[locale]/(app)/match/actions.ts   # EDIT — call reconcile for all participants after recordResultAction commit;
                                       #        return unlockedBadges (actor) in RecordResultResult.

components/achievements/
├── achievements-section.tsx  # NEW — full gallery: builds BadgeView[] over the whole catalog from
│                             #       {stats, earned, rarity}; earned-first sort + "N of M" count.
└── badge-chip.tsx            # NEW — one badge tile: emoji + name + condition; earned (vivid + date)
                              #       vs locked (dimmed + progress bar); optional rarity cue.

app/[locale]/(app)/members/[memberId]/page.tsx  # EDIT — pass the ALREADY-loaded `stats` + getEarnedBadges
                                                 #        (+ optional getClubBadgeRarity) to <AchievementsSection />.

components/.../  (client log/match result components)  # EDIT — on unlockedBadges, celebrateBeer() + toast naming the badge(s).

scripts/backfill-achievements.ts   # NEW — one-pass reconcileAllClubMembers per club, single earned_at stamp.

messages/{cs,en}.json   # EDIT — achievement.* namespace (section title, count, "unlocked" toast, per-badge name+desc+hint).
scripts/i18n-check.ts   # EDIT (only if a JSX-text regex false-positive appears) — add new component(s) to EXCLUDED.

tests/unit/achievement-predicates.spec.ts        # NEW
tests/integration/reconcile-achievements.spec.ts # NEW
tests/component/achievements-section.spec.tsx     # NEW
```

**Structure Decision**: Mirror spec 034 exactly — pure logic in `lib/achievements/`
(like `lib/stats/`), DB work in `lib/db/queries/achievements.ts`, schema in
`lib/db/schema/achievements.ts`, UI in `components/achievements/`. The profile page
is the single display surface (reused from 034). Reconcile is a post-commit call in
existing actions, never a new endpoint and never in render.

## Complexity Tracking

> No Constitution violations — table intentionally empty.
