import { describe, it, expect } from 'vitest';

import { AVATAR_KEYS } from '@/lib/avatars/palette';
import { isValidAvatarKey } from '@/lib/avatars/validate';

describe('isValidAvatarKey', () => {
  it('accepts every key in AVATAR_KEYS', () => {
    for (const key of AVATAR_KEYS) {
      expect(isValidAvatarKey(key)).toBe(true);
    }
  });

  it('rejects an obviously invalid string', () => {
    expect(isValidAvatarKey('banana-republic')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isValidAvatarKey('')).toBe(false);
  });

  it('rejects look-alike near-misses', () => {
    expect(isValidAvatarKey('Beer-Mug')).toBe(false); // case sensitive
    expect(isValidAvatarKey('beer_mug')).toBe(false); // wrong separator
    expect(isValidAvatarKey('beer-mug ')).toBe(false); // trailing space
  });

  it('narrows the string type when true (compile-time smoke check)', () => {
    const s: string = 'star';
    if (isValidAvatarKey(s)) {
      // If narrowing works, `s` is now AvatarKey and indexing GLYPHS
      // with it compiles. The runtime assertion is the safety net.
      expect(AVATAR_KEYS).toContain(s);
    }
  });
});
