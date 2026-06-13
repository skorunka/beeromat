# Contract: "Most badges" board (spec 037)

## getLeaderboards (`lib/db/queries/leaderboards.ts`) — additive

Add to the `Promise.all` (alongside beerRows/boughtRows/matchList/balances):

```ts
// badge count per member — ALL-TIME (no season filter; badges are sticky)
db
  .select({ memberId: memberAchievements.memberId, value: count() })
  .from(memberAchievements)
  .where(eq(memberAchievements.clubId, args.clubId))
  .groupBy(memberAchievements.memberId),
```

Then:

```ts
const badgesValues = new Map(badgeRows.map((r) => [r.memberId, r.value]));
// …append to the returned array:
rankBoard('badges', args.scope, badgesValues, faces, args.viewerMemberId, topN),
```

**Guarantees** (integration-tested):
- Members rank by held-badge count desc; dense ranking + displayName tie-break
  (via the shared `rankBoard`).
- Club-scoped (only `args.clubId`); the viewer row resolves like other boards.
- Identical values under `scope: 'allTime'` and `scope: 'season'` (no `earned_at`
  window) — FR-004.
- Members with zero badges are absent (not in the GROUP BY) → omitted, like streak.

## Renderers

- `lib/stats/types.ts`: `BoardKey` gains `'badges'`.
- `components/stats/leaderboard-board.tsx` `BOARD`: add
  `badges: { key: 'board.badges', emoji: '🏅' }`. `formatValue` falls through to
  `String(value)` (no money/percent special-case) — already the default branch.
- `components/stats/board-select.tsx` `BOARDS`: append `{ key: 'badges', emoji: '🏅' }`.

**Guarantees** (component-tested): the 🏅 chip renders in the switcher and links to
`/leaderboards?board=badges` (scope preserved); the board heading shows
`🏅 {board.badges}`.
