# Contract: Achievements internal interfaces (spec 035)

This is an internal web-app feature — the "contracts" are the TypeScript function
signatures + server-action result shapes that the pieces agree on. No public HTTP
API.

## 1. Pure predicates — `lib/achievements/predicates.ts`

Each badge's condition as a pure function over `MemberStats`. Unit-tested.

```ts
import type { MemberStats } from '@/lib/stats/types';
import { WINRATE_MIN_MATCHES } from '@/lib/stats/constants';

export const isCenturyClub  = (s: MemberStats) => s.totalBeers >= 100;
export const isHatTrick     = (s: MemberStats) => s.bestStreak >= 3;
export const isOnFire       = (s: MemberStats) => s.currentStreak >= 5;
export const isRoundKing    = (s: MemberStats) => s.roundsPoured >= 10;
export const isRegular      = (s: MemberStats) => s.matchesPlayed >= 25;
export const isWinner       = (s: MemberStats) => s.won >= 25;
export const isSharpshooter = (s: MemberStats) =>
  s.matchesPlayed >= WINRATE_MIN_MATCHES && s.winRatio !== null && s.winRatio >= 0.6;
export const isConnoisseur  = (s: MemberStats) => s.distinctBeerTypes >= 5;
export const isNightOwl     = (s: MemberStats) => s.sessionsAttended >= 25;
```

**Contract guarantees** (unit-tested):
- Pure: same input → same output, no I/O.
- Exact-threshold inclusive (100 beers earns; 99 does not; 25 matches earns; 24 not).
- `Sharpshooter` returns false below the min-matches guard even at a perfect ratio,
  and false when `winRatio === null` (no matches).

### Progress — same file

Pure `(stats) => { current, target }` per badge, for the locked-state bar (FR-004).
`current` is clamped to `0..target` for display.

```ts
import type { BadgeProgress } from './types';

const clamp = (n: number, target: number): BadgeProgress => ({ current: Math.min(Math.max(n, 0), target), target });

export const progCenturyClub  = (s: MemberStats) => clamp(s.totalBeers, 100);
export const progWinner       = (s: MemberStats) => clamp(s.won, 25);
export const progOnFire       = (s: MemberStats) => clamp(s.currentStreak, 5);
export const progHatTrick     = (s: MemberStats) => clamp(s.bestStreak, 3);
export const progRoundKing    = (s: MemberStats) => clamp(s.roundsPoured, 10);
export const progRegular      = (s: MemberStats) => clamp(s.matchesPlayed, 25);
export const progConnoisseur  = (s: MemberStats) => clamp(s.distinctBeerTypes, 5);
export const progNightOwl     = (s: MemberStats) => clamp(s.sessionsAttended, 25);
// Sharpshooter is a two-part goal (≥10 matches AND ≥60% win rate). Progress shows the
// gating leg first: matches toward the guard; once past the guard, win-rate vs 60%.
export const progSharpshooter = (s: MemberStats): BadgeProgress =>
  s.matchesPlayed < WINRATE_MIN_MATCHES
    ? clamp(s.matchesPlayed, WINRATE_MIN_MATCHES)        // "7 / 10 matches"
    : clamp(Math.round((s.winRatio ?? 0) * 100), 60);    // "54 / 60 (%)"
```

**Contract guarantees** (unit-tested): pure; `current` never exceeds `target`; an
already-earned badge reads at/above goal (UI renders it complete).

## 2. Catalog — `lib/achievements/catalog.ts`

```ts
import type { Badge, BadgeKey } from './types';
import * as p from './predicates';

// Order = catalog/display order on the profile (earned float to top in the UI).
// Each entry carries name/desc/condition i18n keys (condition shown for ALL badges,
// FR-002), an earn predicate, and a progress fn (locked bar, FR-004). Abbreviated:
export const BADGES: readonly Badge[] = [
  { key: 'centuryClub',  emoji: '💯',
    nameKey: 'achievement.badge.centuryClub.name',
    descriptionKey: 'achievement.badge.centuryClub.desc',
    conditionKey: 'achievement.badge.centuryClub.condition',
    earned: p.isCenturyClub, progress: p.progCenturyClub },
  { key: 'winner',       emoji: '🏆', /* …keys… */ earned: p.isWinner,       progress: p.progWinner },
  { key: 'sharpshooter', emoji: '📈', /* …keys… */ earned: p.isSharpshooter, progress: p.progSharpshooter },
  { key: 'onFire',       emoji: '🔥', /* …keys… */ earned: p.isOnFire,       progress: p.progOnFire },
  { key: 'hatTrick',     emoji: '🎩', /* …keys… */ earned: p.isHatTrick,     progress: p.progHatTrick },
  { key: 'roundKing',    emoji: '🤝', /* …keys… */ earned: p.isRoundKing,    progress: p.progRoundKing },
  { key: 'regular',      emoji: '🎾', /* …keys… */ earned: p.isRegular,      progress: p.progRegular },
  { key: 'connoisseur',  emoji: '🍺', /* …keys… */ earned: p.isConnoisseur,  progress: p.progConnoisseur },
  { key: 'nightOwl',     emoji: '🦉', /* …keys… */ earned: p.isNightOwl,     progress: p.progNightOwl },
];

export const BADGE_BY_KEY: Record<BadgeKey, Badge> =
  Object.fromEntries(BADGES.map((b) => [b.key, b])) as Record<BadgeKey, Badge>;

/** All badge keys a member's CURRENT stats qualify for. */
export function qualifyingBadgeKeys(stats: MemberStats): BadgeKey[] {
  return BADGES.filter((b) => b.earned(stats)).map((b) => b.key);
}
```

**Contract guarantees** (unit-tested):
- Every `BadgeKey` appears exactly once in `BADGES`, each with `earned` + `progress`.
- Every badge has all i18n keys (name/desc/condition) present in BOTH `cs` and `en`
  (enforced by `pnpm i18n:check` parity + a unit test asserting the keys resolve).
- `qualifyingBadgeKeys` is pure and returns a subset of the `BadgeKey` union.

## 3. Reconcile — `lib/db/queries/achievements.ts`

```ts
/**
 * Insert-if-absent for every badge the member currently qualifies for that they
 * don't already hold. STICKY: never deletes. Returns the keys NEWLY inserted by
 * THIS call (for the unlock celebration). Idempotent: a second call with no new
 * qualifying badge returns [].
 *
 * MUST be called AFTER the mutating transaction has committed (it reads live
 * stats via getPlayerStats on the global client). MUST NOT be called during a
 * page render.
 */
export async function reconcileAchievements(args: {
  clubId: string;
  memberId: string;
}): Promise<BadgeKey[]>;

/** All badges a member currently holds, newest-earned first. For the profile. */
export async function getEarnedBadges(args: {
  clubId: string;
  memberId: string;
}): Promise<{ key: BadgeKey; earnedAt: Date }[]>;

/**
 * Backfill helper: reconcile every member of a club, stamping newly-inserted rows
 * with `stampAt` instead of now(). Used once by scripts/backfill-achievements.ts.
 * Returns the total number of rows inserted.
 */
export async function reconcileAllClubMembers(args: {
  clubId: string;
  stampAt: Date;
}): Promise<number>;

/**
 * US3 rarity (FR-020, optional v1): how many members hold each badge, + the club's
 * active member count. ONE GROUP BY on member_achievements + one count. Returns 0
 * for badges nobody holds yet.
 */
export async function getClubBadgeRarity(args: {
  clubId: string;
}): Promise<{ holdersByKey: Record<BadgeKey, number>; clubMembers: number }>;
```

**Implementation contract**:
- `reconcileAchievements`:
  1. `stats = await getPlayerStats({ clubId, memberId })`; if null → return `[]`.
  2. `want = qualifyingBadgeKeys(stats)`; if empty → return `[]`.
  3. `insert(... want rows ...).onConflictDoNothing({ target: [memberId, badgeKey] }).returning({ badgeKey })`.
  4. Return the returned `badgeKey`s (only rows actually inserted → newly earned).
- Insert-if-absent uses the unique index as the conflict target — concurrency-safe
  (two simultaneous actions can't double-insert; the loser's conflict is swallowed
  and it returns no new key, so no double celebration).
- `reconcileAllClubMembers` does the same per member but builds the insert with
  `earnedAt: stampAt`. (`onConflictDoNothing` makes re-running the backfill safe.)

**Resilience contract** (FR-016 / SC-005): callers wrap reconcile in try/catch and
swallow errors (it runs post-commit; a failure cannot affect the committed write).

## 4. Action result extension

The actor's newly-earned badges ride back on the existing success results so the
client can celebrate. Additive, optional field — existing consumers ignore it.

```ts
// app/[locale]/(app)/log/actions.ts
type LogBeerResult        = { ok: true; /* … */ unlockedBadges: BadgeKey[] } | { ok: false; … };
type LogBeerOnBehalfResult= { ok: true; /* … */ unlockedBadges: BadgeKey[] } | { ok: false; … };
type LogRoundResult       = { ok: true; /* … */ unlockedBadges: BadgeKey[] } | { ok: false; … };

// app/[locale]/(app)/match/actions.ts
type RecordResultResult   = { ok: true; /* … */ unlockedBadges: BadgeKey[] } | { ok: false; … };
```

- `unlockedBadges` carries ONLY the **actor's** newly-earned keys (the person at
  the screen). Other affected members are reconciled too but their unlocks are
  persisted silently (no celebration — they aren't present; no notifications in v1).
- Empty array when nothing new was earned (the common case).

**Per-action reconcile fan-out** (post-commit, all wrapped/swallowed):

| Action | Members reconciled | Celebration (`unlockedBadges`) |
|--------|--------------------|--------------------------------|
| `logBeerAction` | actor | actor |
| `logBeerOnBehalfAction` | target, actor | actor |
| `logRoundAction` | each logged drinker, actor | actor |
| `recordResultAction` | all participant member IDs | actor |

## 5. Client celebration contract

The existing client components that call `celebrateBeer()` on success additionally,
when `result.unlockedBadges.length > 0`:
- fire `celebrateBeer()` (reuse the 🍻 overlay), and
- show a toast per badge (or one combined): `t('achievement.unlocked', { badge: t(BADGE_BY_KEY[key].nameKey) + ' ' + emoji })` → e.g. "Odznak odemčen: Century club 💯".

No new celebration mechanism is built; the badge unlock piggybacks the existing one.
Suppressed entirely under `prefers-reduced-motion` (the overlay already self-gates;
the toast remains as the verbal confirmation).

## 6. Profile gallery contract (`/members/[memberId]`)

The profile server component ALREADY loads `stats = getPlayerStats(...)` (spec 034).
It additionally calls `getEarnedBadges({ clubId, memberId })` (and, if rarity is
built, `getClubBadgeRarity({ clubId })`) and passes all to the gallery:

```tsx
<AchievementsSection
  stats={stats}                 // for per-badge progress (already loaded — no new query)
  earned={earnedRows}           // [{ key, earnedAt }] — claimed state + dates
  rarity={rarity ?? null}       // optional US3
/>
```

`AchievementsSection` builds a `BadgeView[]` over the **whole** `BADGES` catalog
(FR-001):
- `earned`/`earnedAt` from the `earned` rows (claimed → vivid + date, FR-003).
- `progress` = `badge.progress(stats)` for every badge (locked bar, FR-004; earned
  badges read complete).
- `condition` rendered for **every** badge from `badge.conditionKey` (FR-002).
- optional `holders`/`clubMembers` from `rarity` (FR-020).
- **Sort**: earned first (newest `earnedAt` first), then locked in catalog order
  (FR-005). Header shows `earnedCount / BADGES.length`.

The gallery runs `badge.progress(stats)` (pure, in-render is fine — it's a pure
function, not I/O) but NEVER calls reconcile or any write (no write-on-read).
