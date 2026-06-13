import { describe, it, expect } from 'vitest';

import type { BadgeView } from '@/lib/achievements/types';
import { applyGalleryView, canSortByRarity } from '@/lib/achievements/gallery-view';

// Spec 037 — pure filter/sort over the badge gallery.

function view(over: Partial<BadgeView> & Pick<BadgeView, 'key'>): BadgeView {
  return {
    emoji: '🏅',
    earned: false,
    earnedAt: null,
    progress: { current: 0, target: 10 },
    ...over,
  } as BadgeView;
}

// 3 earned + 2 locked, varied progress + holders.
const EARNED_A = view({ key: 'centuryClub', earned: true, earnedAt: new Date('2024-01-01'), holders: 20 });
const EARNED_B = view({ key: 'winner', earned: true, earnedAt: new Date('2024-02-01'), holders: 4 });
const LOCKED_NEAR = view({ key: 'regular', progress: { current: 20, target: 25 }, holders: 10 }); // 0.8
const LOCKED_FAR = view({ key: 'nightOwl', progress: { current: 2, target: 25 }, holders: 2 }); // 0.08
const views: BadgeView[] = [EARNED_A, EARNED_B, LOCKED_NEAR, LOCKED_FAR];

describe('applyGalleryView (spec 037)', () => {
  it('{all, default} is an identity pass-through (same order)', () => {
    expect(applyGalleryView(views, { filter: 'all', sort: 'default' })).toEqual(views);
  });

  it('filters Earned / Locked', () => {
    expect(applyGalleryView(views, { filter: 'earned', sort: 'default' }).map((v) => v.key)).toEqual([
      'centuryClub',
      'winner',
    ]);
    expect(applyGalleryView(views, { filter: 'locked', sort: 'default' }).map((v) => v.key)).toEqual([
      'regular',
      'nightOwl',
    ]);
  });

  it('closest: locked nearest-to-unlock first, earned after', () => {
    const keys = applyGalleryView(views, { filter: 'all', sort: 'closest' }).map((v) => v.key);
    // locked by ratio desc (regular 0.8 before nightOwl 0.08), then earned (stable).
    expect(keys).toEqual(['regular', 'nightOwl', 'centuryClub', 'winner']);
  });

  it('rarest: fewest holders first', () => {
    const keys = applyGalleryView(views, { filter: 'all', sort: 'rarest' }).map((v) => v.key);
    // holders: nightOwl 2, winner 4, regular 10, centuryClub 20.
    expect(keys).toEqual(['nightOwl', 'winner', 'regular', 'centuryClub']);
  });

  it('does not mutate the input array', () => {
    const snapshot = [...views];
    applyGalleryView(views, { filter: 'all', sort: 'closest' });
    expect(views).toEqual(snapshot);
  });

  it('canSortByRarity is true only when some view carries holders', () => {
    expect(canSortByRarity(views)).toBe(true);
    expect(canSortByRarity([view({ key: 'regular' })])).toBe(false);
  });
});
