import { describe, expect, it } from 'vitest';

import { initials } from '@/lib/avatars/initials';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { joinSideNames } from '@/lib/format/match-sides';

// Three pure-function modules covered together: the money formatters
// used on every screen, the display-name → initials fallback for
// MemberAvatar, and the match-side label join used on the match
// surfaces. All are render-path helpers; if any silently drifts the
// whole UI gets ugly fast.

describe('formatMoney — full Intl.NumberFormat output', () => {
  it('Czech locale renders korunas with two fractional digits + NBSP space', () => {
    // 12345 minor = 123.45 CZK. The Czech Intl format puts a NBSP
    // ( ) between number and symbol, so use a regex rather
    // than an equality assert to stay portable across ICU minor
    // versions.
    const result = formatMoney(12345n, 'CZK', 'cs');
    expect(result).toMatch(/^123,45[\s ]Kč$/);
  });

  it('English locale renders dollars with a dollar prefix', () => {
    expect(formatMoney(12345n, 'USD', 'en')).toBe('$123.45');
  });

  it('whole amount drops decimals (adaptive)', () => {
    const result = formatMoney(0n, 'CZK', 'cs');
    expect(result).toMatch(/^0[\s ]Kč$/);
  });

  it('handles large whole bigint amounts (no decimals)', () => {
    // (Within reason — Number(bigint) is the precision boundary,
    // but for amounts that fit safely in a double we get the
    // exact value back.)
    const result = formatMoney(99999900n, 'CZK', 'cs');
    expect(result).toMatch(/999[\s  .]999[\s ]Kč$/);
  });
});

describe('formatMoneyCompact — no fractional digits for tight UI surfaces', () => {
  it('strips the .00 fractional part on whole-koruna amounts', () => {
    const result = formatMoneyCompact(38000n, 'CZK', 'cs');
    expect(result).toMatch(/^380[\s ]Kč$/);
  });

  it('rounds amounts with a fractional koruna to the nearest whole', () => {
    // 380.50 → rounded to 381 (Intl uses default half-to-even).
    const result = formatMoneyCompact(38050n, 'CZK', 'cs');
    expect(result).toMatch(/^38[01][\s ]Kč$/);
  });

  it('zero formats as bare 0 with the currency symbol', () => {
    expect(formatMoneyCompact(0n, 'CZK', 'cs')).toMatch(/^0[\s ]Kč$/);
  });
});

describe('initials — display-name → fallback avatar text', () => {
  it('two-word name returns first letter of first and last word', () => {
    expect(initials('Jan Novák')).toBe('JN');
  });

  it('single-word name returns first two letters, upper-cased', () => {
    expect(initials('Pavel')).toBe('PA');
    expect(initials('al')).toBe('AL');
  });

  it('three-plus word names take first + last word\'s first letters', () => {
    expect(initials('Jan Karel Novák')).toBe('JN');
  });

  it('empty / whitespace-only name returns "?"', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('handles single-character single-word name without crashing', () => {
    expect(initials('X')).toBe('X');
  });

  it('collapses multiple internal whitespaces', () => {
    expect(initials('Jan   Novák')).toBe('JN');
  });

  it('upper-cases lowercase initials', () => {
    expect(initials('jan novák')).toBe('JN');
  });
});

describe('joinSideNames — match side label render', () => {
  it('singles side is just the one name, no separator', () => {
    expect(joinSideNames([{ displayName: 'Alice' }])).toBe('Alice');
  });

  it('doubles side is "Alice + Bob"', () => {
    expect(
      joinSideNames([{ displayName: 'Alice' }, { displayName: 'Bob' }]),
    ).toBe('Alice + Bob');
  });

  it('empty array returns empty string (defensive — no UI should call it this way)', () => {
    expect(joinSideNames([])).toBe('');
  });
});
