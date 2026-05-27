import { describe, expect, it } from 'vitest';

import { buildRevolutUrl } from '@/lib/qr-platba/revolut';

// Builds the deep link the /settle page hands to the member. Pure
// string manipulation but the handle has three plausible input
// shapes — covered separately.

describe('buildRevolutUrl', () => {
  it('bare handle is expanded to https://revolut.me/<handle>/<amount><CURRENCY>', () => {
    expect(buildRevolutUrl('johndoe', 12345n, 'CZK')).toBe(
      'https://revolut.me/johndoe/123.45CZK',
    );
  });

  it('@-prefixed handle has the @ stripped', () => {
    expect(buildRevolutUrl('@johndoe', 5000n, 'EUR')).toBe(
      'https://revolut.me/johndoe/50.00EUR',
    );
  });

  it('full https URL is kept as-is (just appends the amount segment)', () => {
    expect(buildRevolutUrl('https://revolut.me/johndoe', 100n, 'CZK')).toBe(
      'https://revolut.me/johndoe/1.00CZK',
    );
  });

  it('trims trailing slashes off the handle before appending', () => {
    expect(buildRevolutUrl('https://revolut.me/johndoe/', 100n, 'CZK')).toBe(
      'https://revolut.me/johndoe/1.00CZK',
    );
    expect(buildRevolutUrl('johndoe///', 100n, 'CZK')).toBe(
      'https://revolut.me/johndoe/1.00CZK',
    );
  });

  it('cents below 10 pad with a leading zero', () => {
    expect(buildRevolutUrl('x', 105n, 'CZK')).toBe(
      'https://revolut.me/x/1.05CZK',
    );
  });

  it('zero cents render as ".00"', () => {
    expect(buildRevolutUrl('x', 100n, 'CZK')).toBe(
      'https://revolut.me/x/1.00CZK',
    );
  });

  it('large amounts round-trip through bigint without precision loss', () => {
    expect(buildRevolutUrl('x', 999999999n, 'CZK')).toBe(
      'https://revolut.me/x/9999999.99CZK',
    );
  });

  it('lower-case currency input is upper-cased in the URL', () => {
    expect(buildRevolutUrl('x', 100n, 'czk')).toBe(
      'https://revolut.me/x/1.00CZK',
    );
  });

  it('whitespace around the handle is trimmed', () => {
    expect(buildRevolutUrl('  johndoe  ', 100n, 'CZK')).toBe(
      'https://revolut.me/johndoe/1.00CZK',
    );
  });
});
