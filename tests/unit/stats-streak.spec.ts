import { describe, it, expect } from 'vitest';

import { currentWinStreak, bestWinStreak } from '@/lib/stats/streak';

const seq = (s: string) => [...s].map((c) => ({ won: c === 'W' }));

describe('streak primitives (spec 034)', () => {
  it('currentWinStreak counts trailing wins', () => {
    expect(currentWinStreak([])).toBe(0);
    expect(currentWinStreak(seq('WWW'))).toBe(3);
    expect(currentWinStreak(seq('WWL'))).toBe(0); // last is a loss
    expect(currentWinStreak(seq('LWW'))).toBe(2);
    expect(currentWinStreak(seq('LLLW'))).toBe(1);
  });

  it('bestWinStreak finds the longest run', () => {
    expect(bestWinStreak([])).toBe(0);
    expect(bestWinStreak(seq('WWWLW'))).toBe(3);
    expect(bestWinStreak(seq('LLL'))).toBe(0);
    expect(bestWinStreak(seq('WLWWLWWW'))).toBe(3);
    expect(bestWinStreak(seq('WWWWW'))).toBe(5);
  });
});
