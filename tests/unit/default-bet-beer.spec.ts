import { describe, it, expect } from 'vitest';

import { pickBetBeer, NoBeerInStockError } from '@/lib/match/default-bet-beer';

// Spec 018 T004 — pure-function unit test for the beer-default
// resolution chain. See research.md §1.

const catalog = [
  { id: 'b-pilsner', name: 'Pilsner', currentStock: 50, isArchived: false, unitPriceMinor: 5000n },
  { id: 'b-kozel', name: 'Kozel', currentStock: 10, isArchived: false, unitPriceMinor: 4000n },
  { id: 'b-budvar', name: 'Budvar', currentStock: 0, isArchived: false, unitPriceMinor: 6000n },
  { id: 'b-staropramen', name: 'Staropramen', currentStock: 5, isArchived: true, unitPriceMinor: 3500n },
];

describe('pickBetBeer (spec 018)', () => {
  it('returns the override when it is valid (active + in stock)', () => {
    const result = pickBetBeer({
      override: 'b-kozel',
      lastBeer: { id: 'b-pilsner', name: 'Pilsner', currentStock: 50, isArchived: false, unitPriceMinor: 5000n },
      catalog,
    });
    expect(result.id).toBe('b-kozel');
  });

  it('falls back to last-beer if override is invalid', () => {
    // override points at an archived beer — invalid; fall through.
    const result = pickBetBeer({
      override: 'b-staropramen',
      lastBeer: { id: 'b-pilsner', name: 'Pilsner', currentStock: 50, isArchived: false, unitPriceMinor: 5000n },
      catalog,
    });
    expect(result.id).toBe('b-pilsner');
  });

  it('returns the last-beer when override is not given and last-beer is valid', () => {
    const result = pickBetBeer({
      override: undefined,
      lastBeer: { id: 'b-pilsner', name: 'Pilsner', currentStock: 50, isArchived: false, unitPriceMinor: 5000n },
      catalog,
    });
    expect(result.id).toBe('b-pilsner');
  });

  it('falls back to the cheapest in-stock beer when last-beer is null', () => {
    const result = pickBetBeer({
      override: undefined,
      lastBeer: null,
      catalog,
    });
    // Cheapest in-stock = Kozel @ 4000; Budvar is cheaper at 3500 but
    // archived (in fact Staropramen is the archived one; let me re-read).
    // Actual cheapest in-stock from the fixture: Kozel @ 4000.
    expect(result.id).toBe('b-kozel');
  });

  it('falls back to cheapest in-stock when last-beer is archived', () => {
    const result = pickBetBeer({
      override: undefined,
      lastBeer: { id: 'b-staropramen', name: 'Staropramen', currentStock: 5, isArchived: true, unitPriceMinor: 3500n },
      catalog,
    });
    expect(result.id).toBe('b-kozel'); // cheapest non-archived in-stock
  });

  it('falls back to cheapest in-stock when last-beer is out of stock', () => {
    const result = pickBetBeer({
      override: undefined,
      lastBeer: { id: 'b-budvar', name: 'Budvar', currentStock: 0, isArchived: false, unitPriceMinor: 6000n },
      catalog,
    });
    expect(result.id).toBe('b-kozel');
  });

  it('throws NoBeerInStockError when nothing is eligible', () => {
    expect(() =>
      pickBetBeer({
        override: undefined,
        lastBeer: null,
        catalog: [
          { id: 'b-a', name: 'A', currentStock: 0, isArchived: false, unitPriceMinor: 1000n },
          { id: 'b-b', name: 'B', currentStock: 10, isArchived: true, unitPriceMinor: 2000n },
        ],
      }),
    ).toThrow(NoBeerInStockError);
  });

  it('throws NoBeerInStockError when catalog is empty', () => {
    expect(() =>
      pickBetBeer({ override: undefined, lastBeer: null, catalog: [] }),
    ).toThrow(NoBeerInStockError);
  });
});
