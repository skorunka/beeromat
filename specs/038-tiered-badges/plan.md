# Implementation Plan: Tiered badges (bronze / silver / gold)

**Branch**: `main` (trunk-based) | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-tiered-badges/spec.md`

## Summary

Turn the 6 count-based badges into **tiered families** (bronze/silver/gold), keeping
win-rate + streak badges single. **Backward-compatible + additive**: the existing
base key IS the bronze tier (e.g. `centuryClub` = bronze), with NEW `…Silver`/`…Gold`
keys added to the code catalog — so every already-awarded row becomes bronze, and the
existing `reconcileAchievements`/backfill ("award every catalog key the member
qualifies for") grants silver/gold automatically with **no schema change and no new
reconcile/backfill code**. The profile gallery renders one tile per family at the
member's highest earned tier + progress to the next; the "N of M" header still counts
families (stays "N of 9"); the spec-037 "Most badges" board keeps counting records
(tiers reward depth). The unlock celebration names the tier ("Century Club — Silver").

## Technical Context

**Language/Version**: TypeScript 6.0, React 19.2, Next.js 16
**Primary Dependencies**: reuses spec 035 (`lib/achievements/{catalog,predicates,types}.ts`,
`reconcileAchievements`, `BadgeView`/`BadgeChip`, `celebrateUnlocks`) + 037 (gallery
filter/sort, badge board). next-intl, Drizzle.
**Storage**: Neon — **NO schema change**. Tiers = additive `badge_key` values over the
existing `member_achievements` table.
**Testing**: unit (tier predicates/progress + family-view selection — the bulk),
integration (reconcile awards tier keys + sticky), component (gallery family tile).
No E2E.
**Performance**: reconcile now checks ~21 keys instead of 9 — still trivial. Gallery
grouping is O(badges). No new queries.
**Constraints**: backward-compat (base key = bronze; existing rows preserved); default
gallery look for single badges unchanged; thresholds tuned vs real data (FR-013).
**Scale/Scope**: catalog restructure (families) + pure helpers + gallery family-grouping
+ BadgeChip tier cue + celebrateUnlocks tier naming + BadgeKey union (+12) + i18n
(tier labels) + tests (new + update 035/037 catalog-dependent ones).

## Constitution Check

- **I. Mobile-First** — ✅ one tile per family (less clutter than 3 rows); tier cue is a small chip.
- **II. Tenant-Aware / single-club** — ✅ no query/scope change; badges already club-scoped.
- **III–VII** — ✅ no money/auth/infra/dep changes; sticky append-only data (V) preserved.
- **VIII. Testing Pyramid** — ✅ see declaration.
- **Test/Prod separation** — ✅ catalog is code config; no test branches.

**No violations.**

### Test layer declaration

- **Unit** — **Yes (bulk).** Tier predicates + progress derived from `(stat, thresholds)`;
  `highestEarnedTier(earnedKeys, family)`; `buildFamilyView` (tier + progress-to-next,
  including maxed + sticky-above-stat cases); `qualifyingBadgeKeys` over families+singles.
- **Integration** — **Yes.** `reconcileAchievements` awards the right tier keys at a stat
  level (bronze→silver→gold cumulative), and stays sticky when the stat drops (voided
  beer doesn't strip silver). Reuse the 035 reconcile harness; only NEW tier behaviour.
- **Component** — **Yes.** The gallery family tile shows the highest earned tier + next
  threshold progress; a no-tier family shows locked bronze; a maxed family shows gold
  complete. Singles render unchanged.
- **E2E** — N/A (display + reconcile side-effect; not a new journey).

## Project Structure

```text
specs/038-tiered-badges/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/{tier-catalog,family-view}.md
└── checklists/requirements.md

lib/achievements/types.ts        # EDIT — add Tier type; BadgeFamily; extend BadgeView
                                 #   with optional `tier`; expand BadgeKey union (+12 keys).
lib/achievements/predicates.ts   # EDIT — keep single-badge predicates; tier predicates/
                                 #   progress are DERIVED from family (stat + thresholds),
                                 #   so mostly a generic helper, not 12 hand-written fns.
lib/achievements/catalog.ts      # EDIT — BADGE_FAMILIES (6, each bronze=base key +
                                 #   silver/gold) + SINGLE_BADGES (3, unchanged); rebuild
                                 #   BADGES/BADGE_BY_KEY/qualifyingBadgeKeys from them;
                                 #   add badgeDisplay(key) → {nameKey, tier?, emoji}.
lib/achievements/family-view.ts  # NEW — pure buildGalleryViews(stats, earnedKeys, rarity)
                                 #   → BadgeView[] (one per family at highest tier + one
                                 #   per single); highestEarnedTier; nextThreshold.
components/achievements/badge-chip.tsx          # EDIT — render the tier cue/label when
                                 #   `tier` is set (bronze/silver/gold pill + "— {Tier}").
components/achievements/achievements-section.tsx # EDIT — build views via buildGalleryViews
                                 #   (replaces the inline per-BADGE map); "N of M" counts
                                 #   families (= families + singles).
components/achievements/celebrate-unlocks.ts     # EDIT — name tier unlocks
                                 #   ("{family name} — {tier}") via badgeDisplay.
messages/{cs,en}.json            # EDIT — achievement.tier.{bronze,silver,gold} (+ keep the
                                 #   per-family name/desc/condition; tiers reuse family copy).

tests/unit/achievement-tiers.spec.ts            # NEW (tier predicates/progress/view)
tests/integration/reconcile-tiers.spec.ts       # NEW (awards tier keys + sticky)
tests/component/achievements-gallery.spec.tsx   # EDIT (family tile / tier label)
tests/unit/achievement-predicates.spec.ts       # EDIT (catalog now families+singles)
tests/component/achievements-section.spec.tsx    # EDIT (family views; count semantics)
```

**Structure Decision**: Introduce a families layer in the catalog as the source of
truth; keep singles as today's `Badge`. Derive the flat tier-key list (for reconcile)
+ the family gallery views from it via PURE helpers in `family-view.ts` (unit-tested).
Reconcile/backfill/board are untouched — the only thing they see is "more keys".

### Key decisions (research)

- **Bronze = the existing base key** (`centuryClub`), silver/gold are new keys
  (`centuryClubSilver`, `centuryClubGold`). Preserves all awarded rows + zero migration;
  the deploy's existing backfill grants silver/gold to everyone who qualifies.
- **Thresholds (starting; FR-013, tune vs heavy seed)**: beers 100/250/500, wins
  25/50/100, matches 25/50/100, rounds 10/25/50, sessions 25/50/100, beerTypes 5/10/20.
  (NB the base wins/matches thresholds are already unreachable on the seed — a
  pre-existing base-tuning backlog item, separate from adding the tier scaffolding.)
- **Counting**: gallery "N of 9" counts each family once (earned if ≥bronze) + singles;
  the Most-badges board (037) keeps counting `member_achievements` rows so tiers raise a
  member's count (depth rewarded) — intentional, documented.
- **Celebration**: `celebrateUnlocks` maps a tier key → "{family} — {tier}" via a new
  `badgeDisplay(key)` catalog helper, so a silver unlock toasts "Century Club — Silver 🍺".

## Complexity Tracking

> No violations — table intentionally empty.
