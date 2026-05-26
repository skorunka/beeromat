import { describe, it, expect } from 'vitest';

import { splitBeerCountAcrossPairs } from '@/lib/match/split-beer-count';

// Spec 018 T002 — pure-function unit test for the doubles-split
// rule. See research.md §2 for the algorithm.

describe('splitBeerCountAcrossPairs (spec 018)', () => {
  describe('singles (numPairs = 1)', () => {
    it('returns [count] for any positive count', () => {
      expect(splitBeerCountAcrossPairs(1, 1)).toEqual([1]);
      expect(splitBeerCountAcrossPairs(2, 1)).toEqual([2]);
      expect(splitBeerCountAcrossPairs(5, 1)).toEqual([5]);
    });

    it('returns [0] for count = 0', () => {
      expect(splitBeerCountAcrossPairs(0, 1)).toEqual([0]);
    });
  });

  describe('doubles (numPairs = 2)', () => {
    it('splits evenly when count is even', () => {
      expect(splitBeerCountAcrossPairs(2, 2)).toEqual([1, 1]);
      expect(splitBeerCountAcrossPairs(4, 2)).toEqual([2, 2]);
    });

    it('rounds up to seat1 pair when count is odd', () => {
      expect(splitBeerCountAcrossPairs(3, 2)).toEqual([2, 1]);
      expect(splitBeerCountAcrossPairs(5, 2)).toEqual([3, 2]);
    });

    it('returns [0, 0] for count = 0', () => {
      expect(splitBeerCountAcrossPairs(0, 2)).toEqual([0, 0]);
    });

    it('handles count = 1 by giving it to seat1 pair', () => {
      expect(splitBeerCountAcrossPairs(1, 2)).toEqual([1, 0]);
    });
  });

  describe('degenerate inputs', () => {
    it('returns [] for numPairs = 0', () => {
      expect(splitBeerCountAcrossPairs(5, 0)).toEqual([]);
    });

    it('returns [] for negative numPairs', () => {
      expect(splitBeerCountAcrossPairs(5, -1)).toEqual([]);
    });
  });
});
