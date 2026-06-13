# Research: Achievements / Badges (spec 035)

All "NEEDS CLARIFICATION" were resolved during the design review baked into the
spec. This file records the decisions and the alternatives weighed.

## R1 — Persist vs. pure live-compute

- **Decision**: Persist earned badges in a `member_achievements` table.
- **Rationale**: The user explicitly asked for "persistent, unlockable… earned
  over time… needs a small schema." Persistence gives a meaningful `earned_at`
  moment (the "you unlocked X!" event) and survives a later stat change.
- **Alternatives considered**:
  - *Pure live-compute on profile render* (spec 034's model) — rejected: no
    earned-at moment, no unlock event, and a voided beer would silently strip a
    badge (feels punishing). Also can't fire a celebration at the moment of
    earning.

## R2 — Where the badge catalog lives

- **Decision**: In code (`lib/achievements/catalog.ts`), not DB rows. Each badge
  = stable `key`, emoji, i18n name/description/hint keys, and a pure `predicate`.
- **Rationale**: Same call spec 034 made for thresholds (`lib/stats/constants.ts`).
  v1 has a fixed badge set (FR-013); per-club config is out of scope. Code is the
  natural home for a predicate + emoji + i18n keys, all unit-testable, no DB read.
- **Alternatives considered**:
  - *`badges` + `tiers` tables* — rejected as over-engineering for a fixed v1 set;
    a predicate can't be stored as a DB row anyway.

## R3 — Sticky / insert-only (never revoked)

- **Decision**: Once a `member_achievements` row exists it is never updated or
  deleted under normal operation. Recognition is insert-if-absent.
- **Rationale**: A badge is a memorial of having once qualified, not a live
  status. Makes void/reverse handling a non-question (FR-004) and keeps the
  "nice/chill" tone (no clawbacks). Also makes reconcile trivially idempotent.
- **Alternatives considered**:
  - *Revocable badges that track the live predicate* — rejected: punishing,
    contradicts the credo, and forces reconcile to both insert and delete with
    race/ordering hazards.

## R4 — Recognise at write-time, not on read

- **Decision**: A shared `reconcileAchievements(memberId)` runs at the END of the
  existing mutation actions, AFTER the transaction commits (same position as the
  post-commit `memberBalance()` read in `logBeerAction`). The profile page only
  READS persisted rows — it never reconciles.
- **Rationale**: A GET performing an INSERT during render is an App Router
  anti-pattern (renders repeat / get discarded / cached under PPR). The mutation
  actions are a small, known set of call sites — not "distributed/fragile."
- **Which actions**: `logBeerAction` (actor), `logBeerOnBehalfAction` (target +
  actor), `logRoundAction` (each drinker + actor), `recordResultAction` (all
  participants). These are exactly the paths that change a badge-relevant stat.
- **Alternatives considered**:
  - *Reconcile-on-read in the profile server component* — rejected (write-on-read).
  - *A single `reconcileMyAchievements()` fired from a client effect on home* —
    viable fallback (one touch point), but `earned_at` is approximate and it
    misses the exact-moment celebration. Rejected in favour of write-time, which
    the existing actions make cheap.

## R5 — Resilience: reconcile must never break the action

- **Decision**: `reconcileAchievements` is called post-commit and wrapped so any
  error is caught, logged, and swallowed — the underlying log/match action still
  returns success (FR-016, SC-005).
- **Rationale**: Badge recognition is a non-critical side effect. A bug in a
  predicate or a transient DB hiccup must never stop a member from logging a beer.
- **Implementation note**: Because reconcile runs post-commit (outside the action's
  transaction), a reconcile failure cannot roll back the real write — exactly the
  isolation we want.

## R6 — All v1 badges derivable from `MemberStats`

- **Decision**: Every v1 badge's predicate reads only `MemberStats`. Two fields are
  added to `MemberStats`: `distinctBeerTypes` (new `countDistinct(beerTypeId)`) and
  `sessionsAttended` (expose the distinct-session count `getPlayerStats` already
  computes internally for `beersPerNight`).
- **Rationale**: Keeps predicates pure + unit-testable, makes backfill a single
  reconcile pass, and avoids any point-in-time event capture. The two new
  aggregates are cheap (one extra query; one already computed).
- **Mapping** (predicate → MemberStats field):
  - Century club 💯 → `totalBeers >= 100`
  - Hat-trick 🎩 → `bestStreak >= 3` (best ≥ current always, so this covers "current OR best")
  - On fire 🔥 → `currentStreak >= 5`
  - Round king 🤝 → `roundsPoured >= 10`
  - Regular 🎾 → `matchesPlayed >= 25`
  - Winner 🏆 → `won >= 25`
  - Sharpshooter 📈 → `matchesPlayed >= WINRATE_MIN_MATCHES (10)` AND `winRatio >= 0.6`
  - Connoisseur 🍺 → `distinctBeerTypes >= 5`  *(new field)*
  - Night owl 🦉 → `sessionsAttended >= 25`  *(new field, exposed)*
- **Deferred**: any badge needing event capture (point-in-time "was #1", "beat the
  reigning champ", "Giant-killer") — out of scope v1 (needs a different data model).

## R7 — Backfill of historical earns

- **Decision**: A one-off `scripts/backfill-achievements.ts` runs
  `reconcileAllClubMembers(clubId, stampAt)` per club, inserting every currently-
  qualifying badge with `earned_at = stampAt` (a single release timestamp passed
  in, NOT per-member "now"). Run once after the migration deploys.
- **Rationale**: Members who already crossed thresholds must see their badges
  immediately (FR-009) without a misleading "unlocked today" (FR-010). A single
  stamp + the UI suppressing the "fresh unlock" pulse for it is the simplest
  defensible treatment.
- **"Fresh unlock" suppression**: the unlock celebration only ever fires from a
  live action's returned `unlockedBadges` (client-side), never from rendering the
  profile. So backfilled rows simply appear as earned, with no pulse — no special
  flag needed. (`earned_at` is shown only as a subtle date/"earned" caption, if at
  all; the design avoids a per-row "NEW!" treatment driven by the timestamp.)
- **Alternatives considered**:
  - *Fold backfill into the migration's data step (raw SQL)* — rejected: the
    predicates live in TS and reuse `getPlayerStats`; re-expressing 9 predicates as
    SQL in a migration duplicates logic and rots. A TS script reusing the real code
    is the single source of truth.
  - *No backfill; let badges accrue going forward* — rejected: violates FR-009
    (a 2-year veteran would show zero badges on day one).

## R8 — Which members to reconcile per action, and who gets the celebration

- **Decision**: Reconcile every member whose badge-relevant stat changed; fire the
  celebration only for the **actor** (the person at the screen).
  - `logBeerAction` → actor only.
  - `logBeerOnBehalfAction` → target (beer count ↑) + actor (rounds/bought-for ↑).
  - `logRoundAction` → each logged drinker + actor.
  - `recordResultAction` → all participant member IDs (played/won/streak/partner ↑).
- **Rationale**: Correctness (FR-005, FR-008) — absent members still earn (sticky,
  shows on their profile later). Celebrating only the actor matches reality (only
  they're looking) and there is no notification system in v1 (out of scope).
- **Cost**: bounded by clubhouse scale (a round of N → N reconciles, each ~10
  indexed queries, post-commit). Accepted per the advisor's "negligible" read and
  the dev-velocity-over-coverage direction. If it ever bites, a lean
  `getBadgeStats` fetching only the ~7 needed aggregates is a clean optimization —
  noted as a backlog option, not built now.

## R9 — Locked-badge preview (US3)

- **Decision**: Build it in v1 if cheap (it is — the full catalog is in code and
  the earned set is known); otherwise it defers cleanly to backlog. Render
  not-yet-earned badges muted with their static unlock hint. No predicate run on
  the profile — "locked" = "in catalog but not in the member's earned set."
- **Rationale**: Pure engagement upside; the catalog-in-code design makes it nearly
  free. Tasteful, not nagging (a quiet "N to unlock" feel, never mean).

## R10 — Migration number & idempotency

- **Decision**: Migration **0015** (last shipped was `0014_red_king_bedlam`).
  Generated via `drizzle-kit generate`. Additive only (CREATE TABLE + indexes);
  idempotent in prod via `vercel-build` → `drizzle-kit migrate`.
- **Rationale**: Matches the project's established migration flow; no change to any
  existing table means zero risk to current data.
