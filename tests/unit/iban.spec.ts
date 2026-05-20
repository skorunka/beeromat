import { describe, expect, it } from 'vitest';

import { isValidIban, normalizeIban } from '@/lib/qr-platba/iban';

describe('isValidIban', () => {
  it('accepts valid IBANs (mod-97 holds)', () => {
    expect(isValidIban('CZ6508000000192000145399')).toBe(true);
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('rejects IBANs that fail the mod-97 checksum', () => {
    expect(isValidIban('CZ6508000000192000145390')).toBe(false);
    expect(isValidIban('GB82WEST12345698765433')).toBe(false);
  });

  it('rejects structurally malformed input', () => {
    expect(isValidIban('')).toBe(false);
    expect(isValidIban('CZ65')).toBe(false);
    expect(isValidIban('1234567890123456')).toBe(false);
    expect(isValidIban('cz-not-an-iban')).toBe(false);
  });
});

describe('normalizeIban', () => {
  it('strips whitespace and upper-cases', () => {
    expect(normalizeIban('cz65 0800 0000 1920 0014 5399')).toBe(
      'CZ6508000000192000145399',
    );
  });
});
