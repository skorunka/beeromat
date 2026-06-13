# Data Model: Achievements / Badges (spec 035)

## New table — `member_achievements`

The **only** schema change. Records that a member holds a badge, and when it was
first earned. Sticky: insert-only, never updated or deleted under normal operation.

```text
member_achievements
├── id            uuid     PK, default random
├── club_id       uuid     NOT NULL → clubs.id (onDelete: restrict)   -- tenant scope (Principle II)
├── member_id     uuid     NOT NULL → members.id (onDelete: cascade)  -- the holder
├── badge_key     text     NOT NULL                                   -- a BadgeKey from the code catalog
└── earned_at     timestamptz NOT NULL default now()                  -- first-earned moment (backfill: release stamp)

indexes:
  - uniqueIndex uniq_member_achievements_member_badge  ON (member_id, badge_key)
        -- enforces "at most one of each badge per member"; the conflict target for insert-if-absent
  - index idx_member_achievements_member  ON (member_id)
        -- the profile read: all badges for one member
```

### Drizzle definition (target — `lib/db/schema/achievements.ts`)

```ts
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { clubs } from './clubs';
import { members } from './members';

// Spec 035 — persisted, sticky badge unlocks. The badge CATALOG (what each key
// means, its emoji, predicate, i18n) lives in code (lib/achievements/catalog.ts),
// NOT here. This table only records who holds which key, and when first earned.
export const memberAchievements = pgTable(
  'member_achievements',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid().notNull().references(() => clubs.id, { onDelete: 'restrict' }),
    memberId: uuid().notNull().references(() => members.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_member_achievements_member_badge').on(t.memberId, t.badgeKey),
    index('idx_member_achievements_member').on(t.memberId),
  ],
);

export type MemberAchievement = typeof memberAchievements.$inferSelect;
export type NewMemberAchievement = typeof memberAchievements.$inferInsert;
```

Register in `lib/db/schema/index.ts`: `export * from './achievements';`.

### Notes / rationale

- **`member_id` cascade vs `club_id` restrict** mirrors the project pattern:
  removing a club is guarded (restrict), but a badge row is meaningless without its
  member so it cascades with the member. (Members are soft-deactivated via
  `is_active`, not hard-deleted, so cascade is a safety net, not a routine path.)
- **`badge_key` is a free `text`**, validated against the code catalog at write
  time (reconcile only ever inserts keys it computed from the catalog). Not a DB
  enum — keeping the catalog as code means adding a future badge is a code change,
  not a migration (additive keys need no schema change). Unknown/retired keys are
  simply ignored by the profile renderer (it renders only keys present in the
  catalog).
- **No `club_id` on the unique index**: `(member_id, badge_key)` is already
  globally unique because `member_id` is globally unique (a member belongs to one
  club seat). `club_id` is carried for tenant-scoped queries + the Principle II
  invariant, and reconcile/read queries still filter on it defensively.

## Changed shape — `MemberStats` (spec 034, `lib/stats/types.ts`)

Two additive fields so every v1 badge predicate is derivable from `MemberStats`:

```ts
export interface MemberStats extends MemberFace {
  // … existing fields …
  totalBeers: number;
  beersPerNight: number | null;
  favouriteBeer: FavouriteBeer | null;
  roundsPoured: number;
  // NEW (spec 035):
  distinctBeerTypes: number;   // count of distinct non-voided beerTypeIds the member logged
  sessionsAttended: number;    // distinct drink sessions the member drank in (already computed internally)
  // … tabMinor, lastWinAt, owesMostTo …
}
```

`getPlayerStats` (`lib/db/queries/player-stats.ts`) changes:
- Add one query to the `Promise.all`: `countDistinct(consumptions.beerTypeId)` with
  the same non-voided join already used for the beer total → `distinctBeerTypes`.
- Expose the existing `distinctSessions` (already read into `sessionRow`) as
  `sessionsAttended` on the returned object.

Both additions are backward-compatible (the profile page and leaderboards ignore
the new fields; only the badge predicates read them).

## Code-side catalog types (`lib/achievements/types.ts`)

Not persisted — the in-code shape the catalog + reconcile + UI share.

```ts
import type { MemberStats } from '@/lib/stats/types';

export type BadgeKey =
  | 'centuryClub'
  | 'hatTrick'
  | 'onFire'
  | 'roundKing'
  | 'regular'
  | 'winner'
  | 'sharpshooter'
  | 'connoisseur'
  | 'nightOwl';

/** Progress toward a badge's goal, for the locked-state bar (US1 / FR-004). */
export interface BadgeProgress {
  current: number;  // clamped 0..target for display
  target: number;
}

export interface Badge {
  key: BadgeKey;
  emoji: string;
  /** i18n keys under the `achievement.badge.<key>` namespace. */
  nameKey: string;        // achievement.badge.<key>.name
  descriptionKey: string; // achievement.badge.<key>.desc
  conditionKey: string;   // achievement.badge.<key>.condition — shown for ALL (FR-002)
  /** Pure predicate over a member's current stats. */
  earned: (stats: MemberStats) => boolean;
  /** Pure progress over the member's current stats (for the locked bar, FR-004). */
  progress: (stats: MemberStats) => BadgeProgress;
}

/** One badge row in the gallery, joined with the member's earned set + stats. */
export interface BadgeView {
  key: BadgeKey;
  emoji: string;
  earned: boolean;
  earnedAt: Date | null;       // set when earned; null when locked
  progress: BadgeProgress;     // for the locked bar; reads as complete when earned
  /** US3 rarity, optional. Holders within the club + club member total. */
  holders?: number;
  clubMembers?: number;
}
```

The gallery shows **all** `BADGES` (FR-001). Sort: earned first (newest `earnedAt`
first), then locked by catalog order. The header count is `earnedCount / BADGES.length`.

## State / lifecycle

```text
(no row)  --reconcile sees predicate true-->  EARNED (row inserted, earned_at set)
EARNED    --any later action / void / reverse-->  EARNED (sticky; never removed)
```

There is exactly one transition and it is one-way. This is what makes reconcile a
pure insert-if-absent and the integration tests small.

## Entities recap (spec ↔ model)

| Spec entity        | Model realisation |
|--------------------|-------------------|
| Earned badge       | a `member_achievements` row (unique per member+badge_key) |
| Badge (catalog)    | a `Badge` literal in `lib/achievements/catalog.ts` (code, not DB) |
| Member statistics  | `MemberStats` from spec 034 (+ 2 new fields), the predicate input |
