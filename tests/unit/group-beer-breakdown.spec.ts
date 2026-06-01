import { describe, expect, it } from 'vitest';

import { groupTabEntriesByBeer } from '@/lib/tab/group-beer-breakdown';
import type { MemberTabEntry } from '@/lib/db/queries/consumption';

// Spec 028 — the breakdown's correctness lives here: bet-adjusted
// inclusion, (type, day) bucketing, sort order, and the invariant
// that the breakdown total equals the tab-total predicate.

function entry(over: Partial<MemberTabEntry> = {}): MemberTabEntry {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'consumption',
    beerTypeName: 'Pilsner',
    unitPriceMinor: 4000n,
    createdAt: new Date('2026-06-01T18:00:00Z'),
    voided: false,
    canUndo: false,
    sourceMatchId: null,
    loggerDisplayName: null,
    loggerMemberId: null,
    loggerAvatarKey: null,
    loggerAvatarUploadAt: null,
    ...over,
  };
}

// The tab-total predicate, mirrored here to assert the invariant.
function tabTotal(entries: MemberTabEntry[]): bigint {
  return entries.reduce(
    (acc, e) => (e.voided || e.kind === 'transfer_out' ? acc : acc + e.unitPriceMinor),
    0n,
  );
}
function breakdownTotal(groups: { subtotalMinor: bigint }[]): bigint {
  return groups.reduce((acc, g) => acc + g.subtotalMinor, 0n);
}

describe('groupTabEntriesByBeer', () => {
  it('groups multiple same-type beers into one group with count + subtotal', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ beerTypeName: 'Pilsner', count: 3, subtotalMinor: 12000n });
  });

  it('keeps distinct beer types as separate groups (even at equal price)', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Bernard', unitPriceMinor: 4000n }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.beerTypeName).sort()).toEqual(['Bernard', 'Pilsner']);
  });

  it('excludes voided entries from count + subtotal', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n, voided: true }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(1);
    expect(groups[0]!.subtotalMinor).toBe(4000n);
  });

  it('excludes transfer_out (won-away) beers', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n, kind: 'transfer_out' }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups[0]!.count).toBe(1);
  });

  it('keeps transfer_in (lost-bet) beers as a SEPARATE origin group, drank first', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n, kind: 'consumption' }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n, kind: 'transfer_in' }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups).toHaveLength(2);
    // drank Pilsner before lost-bet Pilsner (same day).
    expect(groups[0]).toMatchObject({ beerTypeName: 'Pilsner', origin: 'drank', count: 1 });
    expect(groups[1]).toMatchObject({ beerTypeName: 'Pilsner', origin: 'lost_bet', count: 1 });
  });

  it('buckets per (type, day); newest day first', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', createdAt: new Date('2026-06-01T20:00:00Z') }),
      entry({ beerTypeName: 'Pilsner', createdAt: new Date('2026-06-02T20:00:00Z') }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.dayKey).toBe('2026-06-02'); // newest first
    expect(groups[1]!.dayKey).toBe('2026-06-01');
  });

  it('sorts within a day by subtotal descending', () => {
    const entries = [
      // Bernard: 1 × 3000 = 3000
      entry({ beerTypeName: 'Bernard', unitPriceMinor: 3000n }),
      // Pilsner: 2 × 4000 = 8000 (bigger spend → first)
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(groups.map((g) => g.beerTypeName)).toEqual(['Pilsner', 'Bernard']);
  });

  it('breakdown total equals the tab-total predicate (invariant)', () => {
    const entries = [
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n }),
      entry({ beerTypeName: 'Bernard', unitPriceMinor: 3000n }),
      entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n, voided: true }), // excluded
      entry({ beerTypeName: 'Kozel', unitPriceMinor: 3500n, kind: 'transfer_out' }), // excluded
      entry({ beerTypeName: 'Kozel', unitPriceMinor: 3500n, kind: 'transfer_in' }), // included
    ];
    const groups = groupTabEntriesByBeer(entries);
    expect(breakdownTotal(groups)).toBe(tabTotal(entries));
    expect(breakdownTotal(groups)).toBe(4000n + 3000n + 3500n);
  });

  it('empty input → []; single countable entry → one group of count 1', () => {
    expect(groupTabEntriesByBeer([])).toEqual([]);
    // All-excluded also → [].
    expect(
      groupTabEntriesByBeer([entry({ voided: true }), entry({ kind: 'transfer_out' })]),
    ).toEqual([]);
    const one = groupTabEntriesByBeer([entry({ beerTypeName: 'Pilsner', unitPriceMinor: 4000n })]);
    expect(one).toHaveLength(1);
    expect(one[0]!.count).toBe(1);
  });
});
