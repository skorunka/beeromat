import { describe, it, expect } from 'vitest';

import type { MemberStats } from '@/lib/stats/types';
import type { BadgeKey } from '@/lib/achievements/types';
import {
  BADGE_FAMILIES,
  SINGLE_BADGES,
  qualifyingBadgeKeys,
  badgeDisplay,
} from '@/lib/achievements/catalog';
import { buildGalleryViews, highestEarnedTier } from '@/lib/achievements/family-view';
import * as p from '@/lib/achievements/predicates';

// Spec 038 — tiered families (+ the surviving single badges).

const base: MemberStats = {
  memberId: 'm1',
  displayName: 'Test',
  avatarKey: null,
  avatarUploadAt: null,
  matchesPlayed: 0,
  won: 0,
  lost: 0,
  winRatio: null,
  currentStreak: 0,
  bestStreak: 0,
  nemesis: null,
  favouriteVictim: null,
  bestPartner: null,
  jinxPartner: null,
  totalBeers: 0,
  beersPerNight: null,
  favouriteBeer: null,
  roundsPoured: 0,
  distinctBeerTypes: 0,
  sessionsAttended: 0,
  tabMinor: 0n,
  lastWinAt: null,
  owesMostTo: null,
};
const s = (o: Partial<MemberStats>): MemberStats => ({ ...base, ...o });
const earned = (keys: BadgeKey[]) => keys.map((key) => ({ key, earnedAt: new Date('2024-01-01') }));

describe('catalog (spec 038)', () => {
  it('6 tiered families (bronze key === base key) + 3 single badges', () => {
    expect(BADGE_FAMILIES).toHaveLength(6);
    expect(SINGLE_BADGES.map((b) => b.key).sort()).toEqual(['hatTrick', 'onFire', 'sharpshooter']);
    for (const f of BADGE_FAMILIES) {
      expect(f.tiers.map((t) => t.tier)).toEqual(['bronze', 'silver', 'gold']);
      expect(f.tiers[0].key).toBe(f.family); // bronze reuses the base key
      // ascending thresholds
      expect(f.tiers[0].threshold).toBeLessThan(f.tiers[1].threshold);
      expect(f.tiers[1].threshold).toBeLessThan(f.tiers[2].threshold);
    }
  });

  it('qualifyingBadgeKeys awards tiers cumulatively + singles', () => {
    // 250 beers → bronze + silver (not gold); 5-streak → onFire; 3-best → hatTrick.
    const keys = qualifyingBadgeKeys(s({ totalBeers: 250, currentStreak: 5, bestStreak: 5 }));
    expect(keys).toContain('centuryClub');
    expect(keys).toContain('centuryClubSilver');
    expect(keys).not.toContain('centuryClubGold');
    expect(keys).toContain('onFire');
    expect(keys).toContain('hatTrick');
    // nothing → empty
    expect(qualifyingBadgeKeys(base)).toEqual([]);
  });

  it('badgeDisplay resolves base/tier/single keys', () => {
    expect(badgeDisplay('centuryClub')).toMatchObject({ tier: 'bronze', emoji: '💯' });
    expect(badgeDisplay('centuryClubGold')).toMatchObject({ tier: 'gold' });
    expect(badgeDisplay('sharpshooter')?.tier).toBeUndefined();
  });

  it('single predicates keep their guards (sharpshooter)', () => {
    expect(p.isSharpshooter(s({ matchesPlayed: 5, won: 5, winRatio: 1 }))).toBe(false); // below guard
    expect(p.isSharpshooter(s({ matchesPlayed: 10, won: 6, winRatio: 0.6 }))).toBe(true);
  });
});

describe('family-view (spec 038)', () => {
  const century = BADGE_FAMILIES.find((f) => f.family === 'centuryClub')!;

  it('highestEarnedTier picks the top earned tier', () => {
    expect(highestEarnedTier(new Set<BadgeKey>(['centuryClub', 'centuryClubSilver']), century)).toBe('silver');
    expect(highestEarnedTier(new Set<BadgeKey>([]), century)).toBeNull();
  });

  it('family tile: highest earned tier + progress to the NEXT tier', () => {
    // 372 beers, silver earned (bronze+silver), not gold → Silver, "372 / 500".
    const views = buildGalleryViews(s({ totalBeers: 372 }), earned(['centuryClub', 'centuryClubSilver']));
    const v = views.find((x) => x.key === 'centuryClub')!;
    expect(v.tier).toBe('silver');
    expect(v.earned).toBe(true);
    expect(v.progress).toEqual({ current: 372, target: 500 });
  });

  it('locked family shows bronze + progress to bronze', () => {
    const v = buildGalleryViews(s({ totalBeers: 80 }), []).find((x) => x.key === 'centuryClub')!;
    expect(v.earned).toBe(false);
    expect(v.tier).toBe('bronze');
    expect(v.progress).toEqual({ current: 80, target: 100 });
  });

  it('maxed family (gold earned) reads complete (current ≥ target)', () => {
    const v = buildGalleryViews(
      s({ totalBeers: 600 }),
      earned(['centuryClub', 'centuryClubSilver', 'centuryClubGold']),
    ).find((x) => x.key === 'centuryClub')!;
    expect(v.tier).toBe('gold');
    expect(v.progress.current).toBeGreaterThanOrEqual(v.progress.target);
  });

  it('sticky: a tier earned but stat since dropped still shows that tier', () => {
    // silver earned, but beers now 90 (below bronze) — silver stays.
    const v = buildGalleryViews(s({ totalBeers: 90 }), earned(['centuryClub', 'centuryClubSilver'])).find(
      (x) => x.key === 'centuryClub',
    )!;
    expect(v.tier).toBe('silver');
    expect(v.earned).toBe(true);
  });

  it('emits one view per family + one per single (9 total)', () => {
    const views = buildGalleryViews(base, []);
    expect(views).toHaveLength(BADGE_FAMILIES.length + SINGLE_BADGES.length);
    // singles carry a conditionKey; families don't.
    const single = views.find((v) => v.key === 'sharpshooter')!;
    expect(single.conditionKey).toBeTruthy();
    expect(single.tier).toBeUndefined();
  });
});
