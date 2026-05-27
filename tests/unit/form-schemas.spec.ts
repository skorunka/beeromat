import { describe, expect, it } from 'vitest';

import { bankingProfileSchema } from '@/lib/validation/banking';
import {
  beerTypeCreateSchema,
  beerTypeEditSchema,
} from '@/lib/validation/beer-types';
import {
  manualPaymentSchema,
  paidOtherMethodSchema,
} from '@/lib/validation/payments';

// Form-side Zod schemas. The action layer re-validates on the server
// boundary (FR-005), but these schemas drive the inline form errors
// the user actually sees. If any drifts the UI silently accepts bad
// values and the action returns INVALID_INPUT with no field hint.

describe('paidOtherMethodSchema', () => {
  it('accepts a positive major-unit amount with a note', () => {
    const r = paidOtherMethodSchema.safeParse({ amount: '120,50', note: 'cash' });
    expect(r.success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const r = paidOtherMethodSchema.safeParse({ amount: '0', note: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects a missing note (mandatory for treasurer context)', () => {
    const r = paidOtherMethodSchema.safeParse({ amount: '120', note: '' });
    expect(r.success).toBe(false);
  });

  it('rejects a whitespace-only note', () => {
    const r = paidOtherMethodSchema.safeParse({ amount: '120', note: '   ' });
    expect(r.success).toBe(false);
  });
});

describe('manualPaymentSchema', () => {
  it('accepts a positive amount with an empty note (note is optional here)', () => {
    const r = manualPaymentSchema.safeParse({ amount: '120,50', note: '' });
    expect(r.success).toBe(true);
  });

  it('rejects a note over 500 chars', () => {
    const r = manualPaymentSchema.safeParse({
      amount: '120',
      note: 'x'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('beerTypeCreateSchema', () => {
  it('happy path — all required fields valid', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '50,00',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an empty buyPrice (untracked beer)', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      buyPrice: '',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(true);
  });

  it('accepts buyPrice = 0 (donated case)', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      buyPrice: '0',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(true);
  });

  it('rejects buy > sell with the buyAboveSell key on the buyPrice path', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      buyPrice: '60',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues.find((i) => i.path[0] === 'buyPrice');
    expect(issue?.message).toBe('admin.beerTypeBuyAboveSell');
  });

  it('rejects non-digit stock', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      initialStock: '24.5',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero or negative price (must be > 0)', () => {
    const zero = beerTypeCreateSchema.safeParse({
      name: 'Pilsner',
      price: '0',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(zero.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const r = beerTypeCreateSchema.safeParse({
      name: '   ',
      price: '50',
      initialStock: '24',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(false);
  });
});

describe('beerTypeEditSchema', () => {
  it('happy path — no initialStock field on edit', () => {
    const r = beerTypeEditSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(true);
  });

  it('cross-field check fires on edit too', () => {
    const r = beerTypeEditSchema.safeParse({
      name: 'Pilsner',
      price: '50',
      buyPrice: '60',
      lowStockThreshold: '6',
    });
    expect(r.success).toBe(false);
  });
});

describe('bankingProfileSchema — IBAN field', () => {
  // CZ65 0800 0000 1920 0014 5399 — real IBAN with valid mod-97.
  const VALID_IBAN = 'CZ6508000000192000145399';

  it('empty IBAN clears the field (self-pay off)', () => {
    const r = bankingProfileSchema.safeParse({
      iban: '',
      accountHolderName: '',
      revolutHandle: '',
      defaultQrMessage: '',
    });
    expect(r.success).toBe(true);
  });

  it('valid IBAN passes', () => {
    const r = bankingProfileSchema.safeParse({
      iban: VALID_IBAN,
      accountHolderName: '',
      revolutHandle: '',
      defaultQrMessage: '',
    });
    expect(r.success).toBe(true);
  });

  it('valid-shape but bad-checksum IBAN rejected', () => {
    const r = bankingProfileSchema.safeParse({
      iban: 'CZ0008000000192000145399',
      accountHolderName: '',
      revolutHandle: '',
      defaultQrMessage: '',
    });
    expect(r.success).toBe(false);
  });

  it('IBAN with spaces is normalised before checksum check', () => {
    const r = bankingProfileSchema.safeParse({
      iban: 'CZ65 0800 0000 1920 0014 5399',
      accountHolderName: '',
      revolutHandle: '',
      defaultQrMessage: '',
    });
    expect(r.success).toBe(true);
  });

  it('over-length fields are rejected', () => {
    const r = bankingProfileSchema.safeParse({
      iban: '',
      accountHolderName: 'x'.repeat(121),
      revolutHandle: '',
      defaultQrMessage: '',
    });
    expect(r.success).toBe(false);
  });
});
