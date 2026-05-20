import { describe, expect, it } from 'vitest';

import { buildSpaydString } from '@/lib/qr-platba/spayd';
import { buildRevolutUrl } from '@/lib/qr-platba/revolut';

describe('buildSpaydString', () => {
  it('builds a canonical SPAYD string', () => {
    const s = buildSpaydString({
      iban: 'CZ7603000000000076327632',
      amountMinor: 20_000n,
      currencyCode: 'CZK',
      variableSymbol: 1234567890n,
      message: 'beeromat Pavel',
    });
    expect(s).toBe(
      'SPD*1.0*ACC:CZ7603000000000076327632*AM:200.00*CC:CZK*X-VS:1234567890*MSG:beeromat Pavel',
    );
  });

  it('formats minor units with a decimal POINT and two places', () => {
    expect(
      buildSpaydString({
        iban: 'CZ7603000000000076327632',
        amountMinor: 5n,
        currencyCode: 'CZK',
        variableSymbol: 1n,
        message: '',
      }),
    ).toContain('AM:0.05');
    expect(
      buildSpaydString({
        iban: 'CZ7603000000000076327632',
        amountMinor: 123_456n,
        currencyCode: 'CZK',
        variableSymbol: 1n,
        message: '',
      }),
    ).toContain('AM:1234.56');
  });

  it('strips diacritics, asterisks and non-ASCII from the message', () => {
    const s = buildSpaydString({
      iban: 'CZ7603000000000076327632',
      amountMinor: 100n,
      currencyCode: 'CZK',
      variableSymbol: 1n,
      message: 'Nový * Člen ☺',
    });
    // diacritics + asterisk + emoji removed
    expect(s).toContain('MSG:Nov  len');
    expect(s).not.toContain('*MSG:Nový');
  });

  it('omits the MSG field entirely when the message is empty', () => {
    const s = buildSpaydString({
      iban: 'CZ7603000000000076327632',
      amountMinor: 100n,
      currencyCode: 'CZK',
      variableSymbol: 1n,
      message: '',
    });
    expect(s).not.toContain('MSG:');
  });

  it('normalises IBAN whitespace and case', () => {
    const s = buildSpaydString({
      iban: 'cz76 0300 0000 0000 7632 7632',
      amountMinor: 100n,
      currencyCode: 'czk',
      variableSymbol: 1n,
      message: '',
    });
    expect(s).toContain('ACC:CZ7603000000000076327632');
    expect(s).toContain('CC:CZK');
  });
});

describe('buildRevolutUrl', () => {
  it('builds an amount-prefilled URL from a bare handle', () => {
    expect(buildRevolutUrl('johndoe', 20_000n, 'CZK')).toBe(
      'https://revolut.me/johndoe/200.00CZK',
    );
  });

  it('accepts a full revolut.me URL and an @-prefixed tag', () => {
    expect(buildRevolutUrl('https://revolut.me/janedoe', 5000n, 'CZK')).toBe(
      'https://revolut.me/janedoe/50.00CZK',
    );
    expect(buildRevolutUrl('@tag', 5000n, 'EUR')).toBe('https://revolut.me/tag/50.00EUR');
  });
});
