import { describe, it, expect } from 'vitest';

import { selectFunLines } from '@/lib/stats/fun-lines';
import type { MemberStats } from '@/lib/stats/types';

const base: MemberStats = {
  memberId: 'm',
  displayName: 'X',
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
const stats = (o: Partial<MemberStats>): MemberStats => ({ ...base, ...o });
const face = { avatarKey: null, avatarUploadAt: null };

describe('selectFunLines (spec 034)', () => {
  it('no qualifying stats → no lines', () => {
    expect(selectFunLines(base)).toEqual([]);
  });

  it('a win streak ≥ 3 → undefeated line with the count', () => {
    expect(selectFunLines(stats({ currentStreak: 6 }))).toContainEqual({
      key: 'funline.undefeated',
      params: { count: 6 },
    });
  });

  it('a one-sided nemesis leads with the subscription line', () => {
    const lines = selectFunLines(
      stats({
        currentStreak: 4,
        nemesis: { opponentId: 'b', displayName: 'Honza', wins: 0, losses: 7, ...face },
      }),
    );
    expect(lines[0]!.key).toBe('funline.subscription');
    expect(lines[0]!.params).toMatchObject({ wins: 0, losses: 7, name: 'Honza' });
  });

  it('picks the quantity lines when their guards are met', () => {
    const keys = selectFunLines(
      stats({
        beersPerNight: 4.2,
        roundsPoured: 18,
        owesMostTo: { memberId: 'p', displayName: 'Pepa', beerCount: 3, ...face },
        favouriteBeer: { beerTypeId: 'x', name: 'Budvar', count: 40 },
      }),
    ).map((l) => l.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'funline.professional',
        'funline.sugarDaddy',
        'funline.payUp',
        'funline.favouriteBeer',
      ]),
    );
  });

  it('respects guards — owes 1 beer / 9 rounds → no payUp / sugarDaddy', () => {
    const keys = selectFunLines(
      stats({ roundsPoured: 9, owesMostTo: { memberId: 'p', displayName: 'Pepa', beerCount: 1, ...face } }),
    ).map((l) => l.key);
    expect(keys).not.toContain('funline.payUp');
    expect(keys).not.toContain('funline.sugarDaddy');
  });
});
