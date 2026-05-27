import { describe, expect, it } from 'vitest';

import { toMinor } from '@/lib/validation/money';

// Shared major-unit ⇄ minor-unit parser used by EVERY form that
// accepts an amount (manual payment, beer-types buy/sell price,
// settle short-pay). If this drifts, every money form silently
// breaks. The dot/comma duality matters specifically for Czech
// users who paste from bank apps with comma separators.

describe('toMinor', () => {
  it('whole-number major parses with zero fractional digits', () => {
    expect(toMinor('120')).toBe(12000n);
    expect(toMinor('1')).toBe(100n);
    expect(toMinor('0')).toBe(0n);
  });

  it('dot decimal separator parses correctly', () => {
    expect(toMinor('120.50')).toBe(12050n);
    expect(toMinor('0.99')).toBe(99n);
  });

  it('comma decimal separator parses correctly (Czech locale paste)', () => {
    expect(toMinor('120,50')).toBe(12050n);
    expect(toMinor('0,99')).toBe(99n);
  });

  it('single-digit fractional padded with trailing zero', () => {
    expect(toMinor('1.5')).toBe(150n);
    expect(toMinor('1,5')).toBe(150n);
  });

  it('leading/trailing whitespace is trimmed', () => {
    expect(toMinor('  120,50  ')).toBe(12050n);
  });

  it('rejects three-plus fractional digits', () => {
    expect(toMinor('1.234')).toBeNull();
    expect(toMinor('1,234')).toBeNull();
  });

  it('rejects negative amounts', () => {
    expect(toMinor('-1')).toBeNull();
    expect(toMinor('-1.50')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(toMinor('abc')).toBeNull();
    expect(toMinor('')).toBeNull();
    expect(toMinor('1.2.3')).toBeNull();
  });

  it('rejects bare decimal separator without fractional digits', () => {
    expect(toMinor('1.')).toBeNull();
    expect(toMinor('1,')).toBeNull();
    expect(toMinor('.5')).toBeNull();
    expect(toMinor(',5')).toBeNull();
  });

  it('handles amounts beyond Number.MAX_SAFE_INTEGER via bigint', () => {
    // 10 trillion CZK in haléř — well past Number's exact-integer range.
    expect(toMinor('100000000000.00')).toBe(10000000000000n);
  });
});
