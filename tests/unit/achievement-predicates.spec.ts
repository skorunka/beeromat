import { describe, it, expect } from 'vitest';

import type { MemberStats } from '@/lib/stats/types';
import * as p from '@/lib/achievements/predicates';
import { BADGES, BADGE_BY_KEY, qualifyingBadgeKeys } from '@/lib/achievements/catalog';
import type { BadgeKey } from '@/lib/achievements/types';

// A baseline member with nothing earned; override per test.
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
const s = (over: Partial<MemberStats>): MemberStats => ({ ...base, ...over });

describe('badge earn predicates (spec 035) — threshold inclusive', () => {
  it('Century Club: 100 earns, 99 does not', () => {
    expect(p.isCenturyClub(s({ totalBeers: 100 }))).toBe(true);
    expect(p.isCenturyClub(s({ totalBeers: 99 }))).toBe(false);
  });

  it('Winner: 25 wins earns, 24 does not', () => {
    expect(p.isWinner(s({ won: 25 }))).toBe(true);
    expect(p.isWinner(s({ won: 24 }))).toBe(false);
  });

  it('Regular: 25 matches earns, 24 does not', () => {
    expect(p.isRegular(s({ matchesPlayed: 25 }))).toBe(true);
    expect(p.isRegular(s({ matchesPlayed: 24 }))).toBe(false);
  });

  it('Hat-trick: best streak 3 earns (current OR best); On Fire: current 5', () => {
    expect(p.isHatTrick(s({ bestStreak: 3 }))).toBe(true);
    expect(p.isHatTrick(s({ bestStreak: 2 }))).toBe(false);
    expect(p.isOnFire(s({ currentStreak: 5 }))).toBe(true);
    expect(p.isOnFire(s({ currentStreak: 4 }))).toBe(false);
  });

  it('Round King 10; Connoisseur 5 types; Night Owl 25 sessions', () => {
    expect(p.isRoundKing(s({ roundsPoured: 10 }))).toBe(true);
    expect(p.isRoundKing(s({ roundsPoured: 9 }))).toBe(false);
    expect(p.isConnoisseur(s({ distinctBeerTypes: 5 }))).toBe(true);
    expect(p.isConnoisseur(s({ distinctBeerTypes: 4 }))).toBe(false);
    expect(p.isNightOwl(s({ sessionsAttended: 25 }))).toBe(true);
    expect(p.isNightOwl(s({ sessionsAttended: 24 }))).toBe(false);
  });

  it('Sharpshooter: needs the min-matches guard AND 60% — false below guard or at null ratio', () => {
    // perfect ratio but below the 10-match guard
    expect(p.isSharpshooter(s({ matchesPlayed: 5, won: 5, winRatio: 1 }))).toBe(false);
    // guard met, exactly 60%
    expect(p.isSharpshooter(s({ matchesPlayed: 10, won: 6, winRatio: 0.6 }))).toBe(true);
    // guard met, 59% (just under)
    expect(p.isSharpshooter(s({ matchesPlayed: 100, won: 59, winRatio: 0.59 }))).toBe(false);
    // no matches at all
    expect(p.isSharpshooter(s({ matchesPlayed: 0, winRatio: null }))).toBe(false);
  });
});

describe('badge progress (spec 035) — clamped, never exceeds target', () => {
  it('count badges report current/target and never overshoot', () => {
    expect(p.progCenturyClub(s({ totalBeers: 64 }))).toEqual({ current: 64, target: 100 });
    expect(p.progCenturyClub(s({ totalBeers: 264 }))).toEqual({ current: 100, target: 100 });
    expect(p.progWinner(s({ won: 30 }))).toEqual({ current: 25, target: 25 });
    expect(p.progRoundKing(s({ roundsPoured: 0 }))).toEqual({ current: 0, target: 10 });
  });

  it('Sharpshooter shows the gating leg: matches-to-guard, then win-% toward 60', () => {
    // below the guard → progress is matches toward 10
    expect(p.progSharpshooter(s({ matchesPlayed: 7, winRatio: 1 }))).toEqual({ current: 7, target: 10 });
    // past the guard → progress is win-% toward 60
    expect(p.progSharpshooter(s({ matchesPlayed: 20, won: 11, winRatio: 0.55 }))).toEqual({
      current: 55,
      target: 60,
    });
  });
});

describe('badge catalog (spec 035)', () => {
  const ALL_KEYS: BadgeKey[] = [
    'centuryClub',
    'winner',
    'sharpshooter',
    'onFire',
    'hatTrick',
    'roundKing',
    'regular',
    'connoisseur',
    'nightOwl',
  ];

  it('every BadgeKey appears exactly once, each with earn + progress + i18n keys', () => {
    expect(BADGES).toHaveLength(ALL_KEYS.length);
    const seen = new Set<string>();
    for (const b of BADGES) {
      expect(seen.has(b.key)).toBe(false);
      seen.add(b.key);
      expect(typeof b.earned).toBe('function');
      expect(typeof b.progress).toBe('function');
      expect(b.nameKey).toBe(`achievement.badge.${b.key}.name`);
      expect(b.descriptionKey).toBe(`achievement.badge.${b.key}.desc`);
      expect(b.conditionKey).toBe(`achievement.badge.${b.key}.condition`);
      expect(b.emoji.length).toBeGreaterThan(0);
    }
    expect([...seen].sort()).toEqual([...ALL_KEYS].sort());
    for (const k of ALL_KEYS) expect(BADGE_BY_KEY[k].key).toBe(k);
  });

  it('qualifyingBadgeKeys returns only earned keys, in catalog order', () => {
    // a member who has earned exactly Century Club + Regular
    const keys = qualifyingBadgeKeys(s({ totalBeers: 120, matchesPlayed: 25 }));
    expect(keys).toEqual(['centuryClub', 'regular']);
    expect(qualifyingBadgeKeys(base)).toEqual([]);
  });
});
