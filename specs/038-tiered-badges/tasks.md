---
description: "Task list for spec 038 — tiered badges (bronze/silver/gold)"
---

# Tasks: Tiered badges (bronze / silver / gold)

**Input**: Design documents from `specs/038-tiered-badges/`

**Tests**: unit + integration + component (per plan); no E2E.

**Organization**: US1 = tiered gallery tile (MVP). US2 = earn-the-next-tier (reconcile + celebration). Shared foundation = the catalog restructure. Authored on `main`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm clean tree on `main`; dev DB has 035 base badges (so families show bronze immediately).

---

## Phase 2: Foundational (catalog restructure — blocks both stories)

- [X] T002 In `lib/achievements/types.ts`: add `Tier` ('bronze'|'silver'|'gold'), `BadgeTier`, `BadgeFamily`; add optional `tier?: Tier` to `BadgeView`; expand `BadgeKey` with the 12 new keys (`centuryClubSilver/Gold`, `winnerSilver/Gold`, `regularSilver/Gold`, `roundKingSilver/Gold`, `nightOwlSilver/Gold`, `connoisseurSilver/Gold`). Per data-model.md.
- [X] T003 In `lib/achievements/catalog.ts`: define `BADGE_FAMILIES` (6, each: stat selector + 3 ascending tiers, bronze.key === existing base key) + `SINGLE_BADGES` (sharpshooter/hatTrick/onFire, unchanged 035 `Badge`s). Rebuild `qualifyingBadgeKeys(stats)` (families×tiers met + singles earned), `BADGE_BY_KEY` (incl. tier keys), and add `badgeDisplay(key) → {nameKey, emoji, tier?}`. Keep `BADGES` exported if still referenced, or update referrers. Per contracts/tier-catalog.md.
- [X] T004 [P] Add `achievement.tier.{bronze,silver,gold}` to `messages/{cs,en}.json` (Bronz/Stříbro/Zlato · Bronze/Silver/Gold).
- [X] T005 Create `lib/achievements/family-view.ts` — pure `highestEarnedTier(earnedKeys, family)` + `buildGalleryViews(stats, earned, rarity)` → `BadgeView[]` (one per family at highest tier + progress to next; one per single). Per contracts/family-view.md.

**Checkpoint**: catalog + pure helpers compile; reconcile now sees tier keys.

---

## Phase 3: User Story 1 — tiered gallery tile (Priority: P1) 🎯 MVP

**Goal**: A tiered family shows as one tile at the highest earned tier + progress to the next; locked-bronze when none; gold = complete. Singles unchanged.

**Independent Test**: 372-beer member → Century Club Silver "372 / 500"; 80-beer → locked Bronze "80 / 100"; 600-beer → Gold complete.

- [X] T006 [P] [US1] Unit test `tests/unit/achievement-tiers.spec.ts` — `qualifyingBadgeKeys` cumulative tiers; `highestEarnedTier`; `buildGalleryViews` (tier + next-threshold progress; maxed; sticky-above-stat; singles unchanged); `badgeDisplay` tier resolution. (Gate: `pnpm test:unit`.)
- [X] T007 [US1] Edit `components/achievements/badge-chip.tsx` — when `tier` is set, render a bronze/silver/gold cue (🥉🥈🥇 or coloured pill) + the tier label `achievement.tier.<tier>` alongside the family name. Locked-bronze + singles unchanged.
- [X] T008 [US1] Edit `components/achievements/achievements-section.tsx` — build views via `buildGalleryViews(stats, earned, rarity)` (replace the inline per-`BADGE` map); "N of M" counts families+singles (= 9). Keep passing to `<AchievementsGallery>`.
- [X] T009 [US1] Update `tests/component/achievements-section.spec.tsx` + `tests/component/achievements-gallery.spec.tsx` for the family-view shape (family tile w/ tier + progress; count semantics) + `tests/unit/achievement-predicates.spec.ts` for the families+singles catalog. (Gate: `pnpm test:unit` + `pnpm test:component`.)

**Checkpoint**: profile gallery shows tiered family tiles.

---

## Phase 4: User Story 2 — earn the next tier in the moment (Priority: P2)

**Goal**: Crossing a tier threshold awards the tier (cumulative, sticky) and celebrates it by name; backfill grants already-earned tiers on deploy.

**Independent Test**: 249→250 beers awards `centuryClubSilver` + celebrates "Century Club — Silver"; voiding back under 250 keeps silver.

- [X] T010 [US2] Edit `components/achievements/celebrate-unlocks.ts` — resolve each newly-earned key via `badgeDisplay`; tier keys toast "{family name} — {Tier} {emoji}". (reconcileAndCollect + the action wiring are UNCHANGED — they already return new keys.)
- [X] T011 [US2] Integration test `tests/integration/reconcile-tiers.spec.ts` (PGlite, reuse 035 harness): at 250 beers reconcile awards `centuryClub`+`centuryClubSilver` (not gold); crossing 500 adds gold; voiding under 250 keeps silver (sticky); idempotent. (Gate: `pnpm test:integration`.)

**Checkpoint**: tier-ups award + celebrate; sticky verified.

---

## Phase 5: Polish & Cross-Cutting

- [X] T012 Run the full gate suite: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`.
- [X] T013 Re-run `pnpm db:backfill:achievements` locally so the dev club gets its silver/gold tiers; live-walk quickstart.md (family tiles, tier progress, celebration).
- [X] T014 [P] Update `BACKLOG.md` (mark tiered badges shipped) + flip `CLAUDE.md` SPECKIT marker 038 ACTIVE → shipped once validated.

---

## Dependencies & Execution Order

- Foundational (T002–T005) blocks US1 + US2.
- T002→T003 (types before catalog); T004 [P]; T005 after T003.
- US1: T006 [P] after T005; T007→T008; T009 after T008.
- US2: T010 after T003; T011 after T003.
- Polish after stories.

## Implementation Strategy

MVP = the tiered gallery tile (US1) — the visible payoff. Then US2 (celebration + the
sticky reconcile assurance; awarding itself is automatic from the catalog). Ship both,
gates, backfill the dev club, live-walk, then the validation checkpoint before push.

## Notes

- Backward-compatible: bronze = existing base key; no migration; reconcile/backfill/board untouched.
- Singles (sharpshooter/streaks) stay exactly as 035 — don't refactor them into families.
- Updating existing 035/037 tests is expected (the catalog shape changed) — keep their intent.
