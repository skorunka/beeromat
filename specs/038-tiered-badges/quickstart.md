# Quickstart: Tiered badges (spec 038)

## Build order

1. `lib/achievements/types.ts` — `Tier`, `BadgeFamily`, `BadgeTier`; `BadgeView.tier?`;
   expand `BadgeKey` (+12 `…Silver`/`…Gold`).
2. `lib/achievements/catalog.ts` — `BADGE_FAMILIES` (6) + `SINGLE_BADGES` (3); rebuild
   `qualifyingBadgeKeys`, `BADGE_BY_KEY`, add `badgeDisplay`.
3. `lib/achievements/family-view.ts` — `highestEarnedTier` + `buildGalleryViews` + unit tests.
4. `lib/achievements/predicates.ts` — keep single predicates; tier logic is generic (no 12 fns).
5. `components/achievements/badge-chip.tsx` — tier cue + label.
6. `components/achievements/achievements-section.tsx` — build via `buildGalleryViews`.
7. `components/achievements/celebrate-unlocks.ts` — tier naming via `badgeDisplay`.
8. i18n: `achievement.tier.{bronze,silver,gold}` (cs + en).
9. Update the 035/037 catalog-dependent tests; add reconcile-tiers integration test.

## Gates

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration \
  && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build
```

## Manual verification (Docker MCP browser @ host.docker.internal:3010)

1. Open a high-beer profile (e.g. Hana, 305 beers) → **Century Club — Silver** with
   progress to Gold ("305 / 500"). A ~120-beer member → Silver too; an 80-beer member
   → locked Bronze ("80 / 100").
2. Cross a tier live (seed/log a member to 250) → 🍻 + toast "Century Club — Silver".
3. Singles (Sharpshooter / streaks) render exactly as before.
4. "Most badges" board count rises for members with higher tiers (depth rewarded).
5. Default gallery + 037 filter/sort still work over the family tiles.

## Deploy

After merge, the existing `vercel-build` backfill (`reconcileAllClubMembers`) grants
all already-earned tiers automatically — no new backfill step. No migration.
