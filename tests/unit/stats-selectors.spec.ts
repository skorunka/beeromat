import { describe, it, expect } from 'vitest';

import { pickNemesis, pickFavouriteVictim } from '@/lib/stats/head-to-head';
import { pickBestPartner, pickJinxPartner } from '@/lib/stats/partners';
import { beersPerNight } from '@/lib/stats/beers-per-night';
import type { HeadToHead, PartnerRecord } from '@/lib/stats/types';

const face = { avatarKey: null, avatarUploadAt: null };
const h2h = (opponentId: string, displayName: string, wins: number, losses: number): HeadToHead => ({
  opponentId,
  displayName,
  wins,
  losses,
  ...face,
});
const partner = (partnerId: string, displayName: string, wins: number, games: number): PartnerRecord => ({
  partnerId,
  displayName,
  wins,
  games,
  ...face,
});

describe('head-to-head selectors (spec 034)', () => {
  it('nemesis = most losses-to, guarded by min games', () => {
    const list = [h2h('a', 'Honza', 0, 7), h2h('b', 'Pepa', 2, 3), h2h('c', 'Karel', 1, 1)];
    expect(pickNemesis(list)?.opponentId).toBe('a'); // Karel below 3-game guard
    expect(pickNemesis([h2h('c', 'Karel', 1, 1)])).toBeNull(); // only 2 games
  });

  it('favourite victim = most wins-against, guarded', () => {
    const list = [h2h('a', 'Honza', 6, 1), h2h('b', 'Pepa', 3, 0)];
    expect(pickFavouriteVictim(list)?.opponentId).toBe('a');
    expect(pickFavouriteVictim([h2h('x', 'X', 0, 5)])).toBeNull(); // no wins
  });
});

describe('partner selectors (spec 034)', () => {
  const list = [
    partner('a', 'Adam', 8, 10), // 0.8
    partner('b', 'Bohuš', 2, 10), // 0.2
    partner('c', 'Cyril', 2, 2), // below guard
  ];
  it('best partner = highest win-rate (≥min games)', () => {
    expect(pickBestPartner(list)?.partnerId).toBe('a');
  });
  it('jinx partner = lowest win-rate (≥min games)', () => {
    expect(pickJinxPartner(list)?.partnerId).toBe('b');
  });
  it('returns null when no partner meets the guard', () => {
    expect(pickBestPartner([partner('c', 'Cyril', 2, 2)])).toBeNull();
  });
});

describe('beersPerNight (spec 034)', () => {
  it('averages with one decimal; null on zero sessions', () => {
    expect(beersPerNight(0, 0)).toBeNull();
    expect(beersPerNight(21, 5)).toBe(4.2);
    expect(beersPerNight(10, 4)).toBe(2.5);
  });
});
