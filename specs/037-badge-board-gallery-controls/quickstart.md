# Quickstart: Badge board + gallery controls (spec 037)

## Build order

1. `lib/stats/types.ts` — add `'badges'` to `BoardKey`.
2. `lib/db/queries/leaderboards.ts` — add the `member_achievements` COUNT query +
   `rankBoard('badges', …)` (no season filter).
3. `components/stats/leaderboard-board.tsx` + `board-select.tsx` — add the 🏅 entry.
4. `lib/achievements/gallery-view.ts` — pure `applyGalleryView` + `canSortByRarity`
   + unit tests.
5. `components/achievements/achievements-gallery.tsx` (client) — controls + grid.
6. `components/achievements/achievements-section.tsx` — render `<AchievementsGallery>`.
7. i18n: `stats.board.badges` + `achievement.filter*/sort*/filterEmpty` (cs + en).

## Gates

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration \
  && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build
```

## Manual verification (Docker MCP browser @ host.docker.internal:3010)

1. **Badges board** — /leaderboards → tap the 🏅 chip → members ranked by held-
   badge count (podium + your row); switch the all-time/season toggle → the badge
   numbers stay the same (all-time). (Heavy seed has badges from the 035 backfill.)
2. **Gallery filter** — open a profile → Achievements → filter Earned (only earned
   show), Locked (only locked), All (everything).
3. **Gallery sort** — "Closest to unlock" → locked badges reorder by progress;
   "Default" → restores the original order. "Rarest" → fewest-holders first.
4. **Default untouched** — without touching the controls, the gallery looks exactly
   as before.

## Notes

- No migration. The badge board is one extra GROUP BY in the existing Promise.all.
- The dev DB already has badges (035 backfill on the heavy seed), so the board +
  gallery have data immediately.
