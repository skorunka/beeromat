import { describe, it, expect } from 'vitest';

import { winnerLabel } from '@/lib/match/winner-label';

// Spec 030 T006 — pure winner-heading formatter (Vítěz / Vítězové).

describe('winnerLabel', () => {
  it('singles → singular key with the one winner name', () => {
    expect(winnerLabel('singles', ['Franta'])).toEqual({
      key: 'winnerSingular',
      values: { name: 'Franta' },
    });
  });

  it('doubles → plural key with both winners joined', () => {
    expect(winnerLabel('doubles', ['Franta', 'Pepa'])).toEqual({
      key: 'winnerPlural',
      values: { name: 'Franta + Pepa' },
    });
  });

  it('doubles drops empty/missing names when joining', () => {
    expect(winnerLabel('doubles', ['Franta', ''])).toEqual({
      key: 'winnerPlural',
      values: { name: 'Franta' },
    });
  });

  it('singles with no name → empty string (defensive, no throw)', () => {
    expect(winnerLabel('singles', [])).toEqual({
      key: 'winnerSingular',
      values: { name: '' },
    });
  });
});
