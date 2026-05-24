import { describe, expect, it } from 'vitest';

import { accountSchema } from '@/lib/validation/account';

function parse(input: Record<string, unknown>) {
  return accountSchema.safeParse(input);
}

describe('accountSchema — spec 010 display-name validation', () => {
  it('accepts a typical name', () => {
    const r = parse({ displayName: 'Standa Novák' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe('Standa Novák');
  });

  it('trims leading/trailing whitespace', () => {
    const r = parse({ displayName: '  Standa  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.displayName).toBe('Standa');
  });

  it('rejects empty string', () => {
    const r = parse({ displayName: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('account.errors.displayNameRequired');
    }
  });

  it('rejects whitespace-only', () => {
    const r = parse({ displayName: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('account.errors.displayNameRequired');
    }
  });

  it('accepts boundary at 80 chars', () => {
    const r = parse({ displayName: 'x'.repeat(80) });
    expect(r.success).toBe(true);
  });

  it('rejects 81 chars', () => {
    const r = parse({ displayName: 'x'.repeat(81) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('account.errors.displayNameTooLong');
    }
  });

  it('accepts Unicode (Czech diacritics, emoji)', () => {
    expect(parse({ displayName: 'Žofie' }).success).toBe(true);
    expect(parse({ displayName: '🍺 BeerBuddy' }).success).toBe(true);
  });
});
