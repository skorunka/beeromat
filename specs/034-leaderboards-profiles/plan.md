# Implementation Plan: Leaderboards + player profiles

**Branch**: `main` (trunk-based — no feature branch) | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-leaderboards-profiles/spec.md`

## Summary

A read-only stats layer over existing data. Two surfaces: a **Leaderboards**
page (7 ranked boards, all-time/season toggle, podium + self-highlight) and a
**player profile** page (match record, streaks, nemesis/victim, best/jinx
partner, beer aggregates, tab, plus playful fun-lines). The heavy lifting is
**SQL aggregation** (one `GROUP BY` query per board, run in parallel — never a
per-member loop) plus a handful of **pure functions** (win-streak, head-to-head
selection, partner selection, fun-line selection) that are unit-tested. **No
schema change, no migration** — existing indexes (`idx_consumptions_member_*`,
`idx_matches_winner/loser/played`) already back the aggregates. The only
write-side work is extending the heavy dev seed to generate **doubles** matches
so partner stats have data to compute + test against.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), Node 24 LTS

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM 0.45.x
(Neon Postgres), next-intl v4 (cs/en, ICU plurals), Tailwind 4, base-ui.

**Storage**: Neon Postgres via Drizzle. Reads `consumptions` (+ `round_id`),
`matches`, `match_agreements` + `match_agreement_sides`, `match_bet_debts`,
`payments` (via existing `memberBalance`), `drink_sessions`, `beer_types`,
`members`. **No writes, no new tables.**

**Testing**: Vitest unit (pure stat/fun-line fns) + integration (PGlite,
aggregate queries) + component (RTL boards/profile).

**Target Platform**: Mobile-first PWA, club-scoped multi-tenant.

**Project Type**: Web app (Next.js App Router, single project).

**Performance Goals**: Leaderboards page < ~1.5s on the heavy dataset (~50
members, ~13k consumptions, ~270+ matches). All boards aggregated in SQL, run
concurrently; bounded result sets (top-N + viewer row).

**Constraints**: Read-only; club-scoped; exclude voided/reversed data; min-games
guards; playful-but-kind tone; cs + en parity.

**Scale/Scope**: ~50 members; thousands of consumptions; hundreds of matches
over years. 7 boards + 1 profile page + a fun-line engine. ~2 query modules,
~5 pure-fn modules, 2 pages, several components, i18n, doubles-seed extension.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. Boards + profile are read-only, one-thumb
  scrollable lists/tiles; scope toggle is a tap. No desktop requirement.
- **II. Tenant-Aware Schema, Single-Club UX** — PASS. Every query is
  `club_id`-scoped; no cross-club aggregation; stats visible only within the
  club. No global state.
- **III. Track, Don't Transact** — PASS / N/A. Pure reporting; no money moves.
- **IV. Auth** — PASS. Reuses `requireUnlocked`; profiles are club-internal,
  visible to any member; no new auth surface.
- **V. Auditable History (no hard deletes)** — PASS. Read-only; explicitly
  **excludes** voided consumptions + reversed/voided matches so figures mirror
  the audited current state. Nothing mutated.
- **VI. Free-Tier First** — PASS. No new infra; aggregate queries over indexed
  columns.
- **VII. Fresh Code Hygiene** — PASS. No dependency changes.
- **VIII. Testing Pyramid** — PASS (declaration below).
- **i18n** — PASS. Board titles, stat labels, fun-lines all via cs/en catalogs
  with ICU plurals; `i18n:check` enforces parity. Numbers/dates via `Intl.*`.
- **User Input & Forms** — N/A. No text forms; the only control is a
  scope-toggle (segmented links), not a validated input. `forms:check` stays
  green.

**Personas (Spec & Task Discipline):** the spec includes a Personas section
(regular / competitor / occasional / admin) and each acceptance scenario is
serviceable by one — satisfying the rule that recent specs (027–033) skipped.

### Test layer declaration

- **Unit (`pnpm test:unit`)** — YES, the **primary** layer. Pure functions:
  current/best win-streak from an ordered result list; nemesis/favourite-victim
  selection from a head-to-head map (incl. min-games guard + tie-break);
  best/jinx-partner selection; beers-per-night + favourite-beer; **fun-line
  selection** (which lines qualify + their params) — all infrastructure-free.
- **Integration (`pnpm test:integration`)** — YES. The aggregate **leaderboard
  queries** + the **profile aggregates** against PGlite: correct ranking per
  metric, voided/reversed data excluded, the 90-day season window, the
  min-matches guard on the win-rate board, club-scoping, and the partner query
  over seeded **doubles**. The DB-coupled core.
- **Component (`pnpm test:component`)** — YES. The leaderboard board (podium for
  top 3, self-row highlight, empty state), the scope toggle, the profile
  sections, and fun-line rendering (cs/en, plural) — RTL with mocked data.
- **E2E (`pnpm test:e2e`)** — **N/A, not warranted.** This is a read-only
  derived-stats feature: no mutation journey, no auth/data round-trip beyond
  reads already covered. Correctness lives in the aggregate queries (integration)
  + pure selectors (unit) + rendering (component). Consistent with specs
  027–033 keeping E2E to the onboarding journey until a crucial mutating
  journey is spec'd. Adding Playwright for read-only boards is unjustified.

**Result: PASS — no Complexity Tracking entries.**

## Project Structure

### Documentation (this feature)

```text
specs/034-leaderboards-profiles/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── leaderboard-queries.md   # board metric contracts + scope/threshold rules
│   ├── profile-stats.md         # per-member aggregate contract
│   └── fun-lines.md             # fun-line selection contract
└── tasks.md                     # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
lib/
├── stats/
│   ├── types.ts                 # NEW — MemberStats, BoardRow, HeadToHead, PartnerRecord, FunLine
│   ├── streak.ts                # NEW — pure current/best win-streak from ordered results
│   ├── head-to-head.ts          # NEW — pure nemesis / favourite-victim selection (+ guard)
│   ├── partners.ts              # NEW — pure best / jinx partner selection (+ guard)
│   ├── beers-per-night.ts       # NEW — pure avg + favourite-beer pickers
│   └── fun-lines.ts             # NEW — pure fun-line selection (stats → ordered {key,params}[])
└── db/queries/
    ├── leaderboards.ts          # NEW — one aggregate (GROUP BY) query per board; season-scoped
    └── player-stats.ts          # NEW — a member's aggregates + match/partner rows for the profile

app/[locale]/(app)/
├── leaderboards/page.tsx        # NEW — boards + all-time/season toggle (?scope=season)
├── members/[memberId]/page.tsx  # NEW — player profile
└── account/page.tsx             # MODIFY — link to own profile (/members/[me])

components/stats/
├── leaderboard-board.tsx        # NEW — one board: podium top-3 + ranked rows + self-highlight
├── scope-toggle.tsx             # NEW — all-time / this-season segmented control (link-based)
├── stat-tile.tsx                # NEW — a labelled profile stat
├── head-to-head-card.tsx        # NEW — nemesis / favourite victim / partners
└── fun-line.tsx                 # NEW — renders a selected fun-line via t()

components/nav/bottom-nav.tsx     # MODIFY — add a Leaderboards entry (+ match-hub link)
app/[locale]/(app)/match/page.tsx # MODIFY — link to Leaderboards from the hub

messages/{cs,en}.json            # MODIFY — stats.* + funline.* namespaces (board titles, labels, lines)

scripts/seed-heavy.ts            # MODIFY — also generate DOUBLES matches (partner-stat data)

tests/
├── unit/stats-*.spec.ts         # streak, head-to-head, partners, beers-per-night, fun-lines
├── integration/leaderboards.spec.ts   # board ranking, voided-excluded, season window, guard
├── integration/player-stats.spec.ts   # profile aggregates incl. doubles partners
└── component/{leaderboard-board,scope-toggle,profile,fun-line}.spec.tsx
```

**Structure Decision**: Single Next.js project. The feature is additive +
read-only: two query modules (aggregates), a `lib/stats/` package of pure
selectors (the unit-test heartland), two pages, a `components/stats/` set, i18n,
and a doubles extension to the existing heavy seed. No `drizzle/` migration.

## Complexity Tracking

No Constitution Check violations — table intentionally empty.
