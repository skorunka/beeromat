import { describe, it, expect } from 'vitest';

import { logRoundSchema } from '@/lib/validation/round';

// Spec 033 — round payload validation (pure; the server seatbelt behind
// the tap-driven UI).

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const BEER = '44444444-4444-4444-8444-444444444444';

describe('logRoundSchema', () => {
  it('accepts a valid multi-drinker round', () => {
    const r = logRoundSchema.safeParse({
      items: [
        { memberId: A, beerTypeId: BEER },
        { memberId: B, beerTypeId: BEER },
        { memberId: C, beerTypeId: BEER },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty round', () => {
    expect(logRoundSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rejects a duplicate drinker (one beer per drinker per round)', () => {
    const r = logRoundSchema.safeParse({
      items: [
        { memberId: A, beerTypeId: BEER },
        { memberId: A, beerTypeId: B }, // same member twice
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-uuid memberId or beerTypeId', () => {
    expect(
      logRoundSchema.safeParse({ items: [{ memberId: 'nope', beerTypeId: BEER }] }).success,
    ).toBe(false);
    expect(
      logRoundSchema.safeParse({ items: [{ memberId: A, beerTypeId: 'nope' }] }).success,
    ).toBe(false);
  });
});
