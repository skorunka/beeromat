# Phase 1 Data Model: Leaderboards + player profiles

**No schema change. No migration.** Everything is computed on read from existing
tables. This documents the computed shapes + the source rows + the validation
(threshold / exclusion) rules.

## Source tables (read-only)

| Table | Used for |
|---|---|
| `members` | active roster, avatar/name, club scope |
| `consumptions` (+ `round_id`) | beers drunk, beers/night, favourite beer, rounds poured, bought-for-others |
| `consumption_voids` | EXCLUDE voided consumptions (left-join `IS NULL`) |
| `drink_sessions` | distinct nights (beers/night denominator) |
| `beer_types` | beer name (favourite beer) |
| `matches` | win/loss, played, opponent (head-to-head), streaks |
| `match_agreements` | doubles flag, `winningSide`, reversed/cancelled exclusion |
| `match_agreement_sides` | partners (same side) |
| `match_bet_debts` | beers owed (a fun-line) |
| `payments` / balance | current tab (via `memberBalance`) |

**Exclusion rules (FR-007):** a stat MUST ignore (a) consumptions with a
`consumption_voids` row, and (b) matches whose agreement is reversed
(`reversed_at`) or cancelled (`cancelled_at`), and `matches.voided_at` rows.

## Computed entities

### BoardRow

| Field | Type | Notes |
|---|---|---|
| `memberId` | uuid | |
| `displayName`, `avatarKey`, `avatarUploadAt` | — | for `<MemberAvatar>` |
| `value` | number \| bigint | the board's metric value |
| `rank` | number | 1-based; ties share a rank (dense), tie-break by displayName |
| `isViewer` | boolean | true for the viewing member's own row |

### Leaderboard

| Field | Type | Notes |
|---|---|---|
| `key` | enum | `beers \| tab \| wins \| played \| winRate \| streak \| boughtForOthers` |
| `scope` | `'allTime' \| 'season'` | season = rolling 90 days (tab ignores scope) |
| `rows` | BoardRow[] | top-N (e.g. 20), desc by value |
| `viewerRow` | BoardRow \| null | the viewer, even if outside top-N (for pin/highlight) |
| `thresholdNote` | string \| null | e.g. win-rate "min 10 matches" |

**Validation**: `winRate` board excludes members with `< 10` qualifying matches
(FR-008). Only **active** members appear (FR-001).

### HeadToHead (per opponent, for a profile)

`{ opponentId, displayName, avatar…, wins, losses }`. Selection (pure):
- **nemesis** = max `losses` (then max games, then name), guard `wins+losses ≥ 3`.
- **favouriteVictim** = max `wins`, same guard.

### PartnerRecord (per doubles partner, for a profile)

`{ partnerId, displayName, avatar…, wins, games }`, `winRate = wins/games`.
Selection (pure): **bestPartner** = max win-rate; **jinxPartner** = min win-rate;
both guarded by `games ≥ 3`. Ties → more games, then name.

### MemberStats (the profile aggregate)

| Field | Type |
|---|---|
| `memberId`, `displayName`, avatar… | identity |
| `matchesPlayed`, `won`, `lost` | number |
| `winRatio` | number \| null (null when `played = 0`) |
| `currentStreak`, `bestStreak` | number (consecutive wins) |
| `nemesis`, `favouriteVictim` | HeadToHead \| null (null below guard) |
| `bestPartner`, `jinxPartner` | PartnerRecord \| null (null below guard / no doubles) |
| `totalBeers` | number |
| `beersPerNight` | number \| null (null when no sessions) |
| `favouriteBeer` | `{ beerTypeId, name, count }` \| null |
| `roundsPoured` | number |
| `tabMinor` | bigint (current outstanding) |
| `lastWinAt` | Date \| null (for the "hasn't won since" line) |
| `owesMostTo` | `{ memberId, name, beerCount }` \| null (open bet debts) |

### FunLine (computed, not persisted)

`{ key: string; params: Record<string, string | number> }`. `selectFunLines`
returns an **ordered** list (most-fun first); the page renders the top 1–2. A
member with no qualifying line → empty list (page shows none / one gentle
default). Keys map to `funline.*` catalog entries (cs/en, ICU plurals).

## Lifecycle

All entities are **derived on each read** — no state, no transitions, nothing
persisted. They always reflect the current (post-void, post-reversal) records.
