import { describe, expect, it } from 'vitest';

import {
  SESSION_TITLE_MAX_LENGTH,
  sessionTitleSchema,
} from '@/lib/validation/session-title';

describe('sessionTitleSchema — spec 022 drink-session title', () => {
  it('passes a typical title through trimmed', () => {
    const r = sessionTitleSchema.safeParse('  Středeční debly s Pardubicema  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Středeční debly s Pardubicema');
  });

  it('accepts boundary at 60 chars (after trim)', () => {
    const r = sessionTitleSchema.safeParse('x'.repeat(SESSION_TITLE_MAX_LENGTH));
    expect(r.success).toBe(true);
  });

  it('rejects 61 chars after trim', () => {
    const r = sessionTitleSchema.safeParse('x'.repeat(SESSION_TITLE_MAX_LENGTH + 1));
    expect(r.success).toBe(false);
  });

  it('treats empty string as null (clears title)', () => {
    const r = sessionTitleSchema.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('treats whitespace-only as null (clears title)', () => {
    const r = sessionTitleSchema.safeParse('   \t\n  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it('preserves Czech diacritics', () => {
    const r = sessionTitleSchema.safeParse('Žofie a žluťoučký kůň');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Žofie a žluťoučký kůň');
  });

  it('preserves emoji', () => {
    const r = sessionTitleSchema.safeParse('🍺 Po finále s Plzní 🏆');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('🍺 Po finále s Plzní 🏆');
  });
});
