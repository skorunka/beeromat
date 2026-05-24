import { describe, expect, it } from 'vitest';

import { onboardingSchema } from '@/lib/validation/onboarding';

function parse(input: Record<string, unknown>) {
  return onboardingSchema.safeParse(input);
}

const valid = {
  clubName: 'Tenisový klub Šafařík',
  currencyCode: 'CZK',
  defaultLocale: 'cs',
  adminEmail: 'pavel@example.test',
};

describe('onboardingSchema — spec 009 validation rules', () => {
  it('accepts a happy-path payload and normalises currency + email', () => {
    const r = parse({ ...valid });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currencyCode).toBe('CZK');
      expect(r.data.adminEmail).toBe('pavel@example.test');
    }
  });

  it('club name: rejects empty string after trim', () => {
    const r = parse({ ...valid, clubName: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['clubName']);
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.clubNameRequired');
    }
  });

  it('club name: accepts boundary at 120 chars; rejects 121', () => {
    expect(parse({ ...valid, clubName: 'x'.repeat(120) }).success).toBe(true);
    const r = parse({ ...valid, clubName: 'x'.repeat(121) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.clubNameTooLong');
    }
  });

  it('currency: accepts lowercase input (czk) and uppercases it to CZK', () => {
    const r = parse({ ...valid, currencyCode: 'czk' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currencyCode).toBe('CZK');
    }
  });

  it('currency: rejects 2-letter codes', () => {
    const r = parse({ ...valid, currencyCode: 'CZ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.currencyInvalid');
    }
  });

  it('currency: rejects mixed alphanumeric (CZK1)', () => {
    const r = parse({ ...valid, currencyCode: 'CZK1' });
    expect(r.success).toBe(false);
  });

  it('currency: rejects empty input', () => {
    const r = parse({ ...valid, currencyCode: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.currencyRequired');
    }
  });

  it('defaultLocale: accepts cs and en (the routing.locales values)', () => {
    expect(parse({ ...valid, defaultLocale: 'cs' }).success).toBe(true);
    expect(parse({ ...valid, defaultLocale: 'en' }).success).toBe(true);
  });

  it('defaultLocale: rejects values outside routing.locales (de)', () => {
    const r = parse({ ...valid, defaultLocale: 'de' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.defaultLocaleInvalid');
    }
  });

  it('adminEmail: trims + lowercases; PAVEL@EXAMPLE.TEST → pavel@example.test', () => {
    const r = parse({ ...valid, adminEmail: '  PAVEL@Example.Test  ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.adminEmail).toBe('pavel@example.test');
    }
  });

  it('adminEmail: rejects malformed shapes', () => {
    expect(parse({ ...valid, adminEmail: 'not-an-email' }).success).toBe(false);
    expect(parse({ ...valid, adminEmail: 'noatsign.example.com' }).success).toBe(false);
    expect(parse({ ...valid, adminEmail: 'a@b' }).success).toBe(false);
  });

  it('adminEmail: rejects empty input', () => {
    const r = parse({ ...valid, adminEmail: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('onboarding.errors.adminEmailRequired');
    }
  });
});
