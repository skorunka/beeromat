import { describe, expect, it } from 'vitest';

import {
  cancelAgreementSchema,
  createAgreementSchema,
  editAgreementSchema,
  recordResultSchema,
  reverseResultSchema,
} from '@/lib/validation/match-agreement';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const AGREEMENT = '55555555-5555-4555-8555-555555555555';

describe('createAgreementSchema — spec 013', () => {
  it('accepts a happy-path doubles payload (pairing=straight)', () => {
    const r = createAgreementSchema.safeParse({
      format: 'doubles',
      forBeer: true,
      sides: { A: { seat1: A, seat2: B }, B: { seat1: C, seat2: D } },
      pairingKind: 'straight',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a happy-path doubles payload (pairing=crossed)', () => {
    const r = createAgreementSchema.safeParse({
      format: 'doubles',
      forBeer: false,
      sides: { A: { seat1: A, seat2: B }, B: { seat1: C, seat2: D } },
      pairingKind: 'crossed',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a happy-path singles payload (no pairingKind)', () => {
    const r = createAgreementSchema.safeParse({
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: A }, B: { seat1: B } },
    });
    expect(r.success).toBe(true);
  });

  it('doubles MUST have a pairingKind (FR-006: no implicit default)', () => {
    const r = createAgreementSchema.safeParse({
      format: 'doubles',
      forBeer: true,
      sides: { A: { seat1: A, seat2: B }, B: { seat1: C, seat2: D } },
      // pairingKind missing
    });
    expect(r.success).toBe(false);
  });

  it('singles MUST NOT carry a pairingKind', () => {
    const r = createAgreementSchema.safeParse({
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: A }, B: { seat1: B } },
      pairingKind: 'straight',
    });
    expect(r.success).toBe(false);
  });

  it('rejects DUPLICATE_MEMBER — same member on two seats (doubles)', () => {
    const r = createAgreementSchema.safeParse({
      format: 'doubles',
      forBeer: true,
      // Member A appears on side A seat 1 AND side B seat 2.
      sides: { A: { seat1: A, seat2: B }, B: { seat1: C, seat2: A } },
      pairingKind: 'straight',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'match.errors.duplicateMember')).toBe(true);
    }
  });

  it('rejects DUPLICATE_MEMBER — singles with same member on both sides', () => {
    const r = createAgreementSchema.safeParse({
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: A }, B: { seat1: A } },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'match.errors.duplicateMember')).toBe(true);
    }
  });

  it('rejects when forBeer flag is missing', () => {
    const r = createAgreementSchema.safeParse({
      format: 'singles',
      sides: { A: { seat1: A }, B: { seat1: B } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects when a side member id is not a UUID', () => {
    const r = createAgreementSchema.safeParse({
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: 'not-a-uuid' }, B: { seat1: B } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects doubles when a side is missing seat2', () => {
    const r = createAgreementSchema.safeParse({
      format: 'doubles',
      forBeer: true,
      sides: { A: { seat1: A, seat2: B }, B: { seat1: C } },
      pairingKind: 'straight',
    });
    expect(r.success).toBe(false);
  });
});

describe('editAgreementSchema — spec 013', () => {
  it('accepts a valid singles patch', () => {
    const r = editAgreementSchema.safeParse({
      agreementId: AGREEMENT,
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: A }, B: { seat1: B } },
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects an edit with duplicate members', () => {
    const r = editAgreementSchema.safeParse({
      agreementId: AGREEMENT,
      patch: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: A }, B: { seat1: A } },
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('cancelAgreementSchema / recordResultSchema / reverseResultSchema — spec 013', () => {
  it('cancelAgreementSchema requires a UUID id', () => {
    expect(cancelAgreementSchema.safeParse({ agreementId: AGREEMENT }).success).toBe(true);
    expect(cancelAgreementSchema.safeParse({ agreementId: 'nope' }).success).toBe(false);
  });

  it('recordResultSchema requires winningSide ∈ {A,B}', () => {
    expect(
      recordResultSchema.safeParse({ agreementId: AGREEMENT, winningSide: 'A' }).success,
    ).toBe(true);
    expect(
      recordResultSchema.safeParse({ agreementId: AGREEMENT, winningSide: 'B' }).success,
    ).toBe(true);
    expect(
      recordResultSchema.safeParse({ agreementId: AGREEMENT, winningSide: 'X' }).success,
    ).toBe(false);
  });

  it('reverseResultSchema requires a UUID id', () => {
    expect(reverseResultSchema.safeParse({ agreementId: AGREEMENT }).success).toBe(true);
    expect(reverseResultSchema.safeParse({}).success).toBe(false);
  });
});
