// Spec 038 — build the gallery's BadgeView[] from the tiered families + single
// badges. Pure (no I/O): one tile per family at the member's highest earned tier
// (+ progress to the next), one tile per single badge (035 behaviour). Unit-tested.

import type { MemberStats } from '@/lib/stats/types';
import type { BadgeFamily, BadgeKey, BadgeView, Tier } from './types';
import { BADGE_FAMILIES, SINGLE_BADGES } from './catalog';

/** The member's highest earned tier for a family (from the persisted earned set), or null. */
export function highestEarnedTier(earned: Set<BadgeKey>, family: BadgeFamily): Tier | null {
  let best: Tier | null = null;
  for (const t of family.tiers) if (earned.has(t.key)) best = t.tier;
  return best;
}

const clampTo = (n: number, target: number) => Math.min(Math.max(n, 0), target);

function familyView(
  family: BadgeFamily,
  stats: MemberStats,
  earnedAtByKey: Map<BadgeKey, Date>,
  rarity?: Rarity | null,
): BadgeView {
  const earnedSet = new Set([...earnedAtByKey.keys()]);
  const tier = highestEarnedTier(earnedSet, family);
  const current = family.stat(stats);

  // Target = the first tier threshold strictly above the highest earned tier; if gold
  // is earned (or none above), target = the top (gold) threshold (renders complete).
  const earnedIdx = tier ? family.tiers.findIndex((t) => t.tier === tier) : -1;
  const nextTier = family.tiers[earnedIdx + 1] ?? family.tiers[family.tiers.length - 1]!;
  const target = nextTier.threshold;

  // earnedAt of the highest earned tier (for the "Earned {date}" caption + sorting).
  const earnedAt = tier ? earnedAtByKey.get(family.tiers[earnedIdx]!.key) ?? null : null;

  const view: BadgeView = {
    key: family.family,
    emoji: family.emoji,
    nameKey: family.nameKey,
    tier: tier ?? 'bronze', // locked families show a bronze cue with progress to bronze
    earned: tier !== null,
    earnedAt,
    progress: { current: clampTo(current, target), target },
  };
  if (rarity) {
    // Rarity keys off the highest earned tier's key (or the base/bronze key when locked).
    const rarityKey = tier ? family.tiers[earnedIdx]!.key : family.family;
    view.holders = rarity.holdersByKey[rarityKey] ?? 0;
    view.clubMembers = rarity.clubMembers;
  }
  return view;
}

interface Rarity {
  holdersByKey: Record<string, number>;
  clubMembers: number;
}

/** One BadgeView per family (at highest tier) + one per single badge. */
export function buildGalleryViews(
  stats: MemberStats,
  earned: { key: BadgeKey; earnedAt: Date }[],
  rarity?: Rarity | null,
): BadgeView[] {
  const earnedAtByKey = new Map(earned.map((e) => [e.key, e.earnedAt]));
  const views: BadgeView[] = BADGE_FAMILIES.map((f) => familyView(f, stats, earnedAtByKey, rarity));

  for (const b of SINGLE_BADGES) {
    const earnedAt = earnedAtByKey.get(b.key) ?? null;
    const view: BadgeView = {
      key: b.key,
      emoji: b.emoji,
      nameKey: b.nameKey,
      conditionKey: b.conditionKey,
      earned: earnedAt !== null,
      earnedAt,
      progress: b.progress(stats),
    };
    if (rarity) {
      view.holders = rarity.holdersByKey[b.key] ?? 0;
      view.clubMembers = rarity.clubMembers;
    }
    views.push(view);
  }
  return views;
}
