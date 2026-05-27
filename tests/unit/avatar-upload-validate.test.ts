import { describe, it, expect } from 'vitest';

import {
  AVATAR_MAX_BYTES,
  validateAvatarBytes,
} from '@/lib/avatars/upload-validate';

describe('validateAvatarBytes (spec 021)', () => {
  function buf(size: number): Uint8Array {
    return new Uint8Array(size);
  }

  it('accepts every allowed content-type', () => {
    const data = buf(100);
    expect(validateAvatarBytes(data, 'image/jpeg')).toEqual({ ok: true });
    expect(validateAvatarBytes(data, 'image/png')).toEqual({ ok: true });
    expect(validateAvatarBytes(data, 'image/webp')).toEqual({ ok: true });
  });

  it('rejects non-image content-types', () => {
    expect(validateAvatarBytes(buf(100), 'application/pdf')).toEqual({
      ok: false,
      code: 'INVALID_CONTENT_TYPE',
    });
    expect(validateAvatarBytes(buf(100), 'text/plain')).toEqual({
      ok: false,
      code: 'INVALID_CONTENT_TYPE',
    });
    expect(validateAvatarBytes(buf(100), 'image/gif')).toEqual({
      ok: false,
      code: 'INVALID_CONTENT_TYPE',
    });
  });

  it('rejects oversize buffers (> 256 KB)', () => {
    const tooBig = buf(AVATAR_MAX_BYTES + 1);
    expect(validateAvatarBytes(tooBig, 'image/jpeg')).toEqual({
      ok: false,
      code: 'OVERSIZE',
    });
  });

  it('accepts buffers exactly at the size cap', () => {
    const atCap = buf(AVATAR_MAX_BYTES);
    expect(validateAvatarBytes(atCap, 'image/jpeg')).toEqual({ ok: true });
  });

  it('rejects empty buffers with EMPTY_IMAGE (priority over content-type check)', () => {
    expect(validateAvatarBytes(buf(0), 'image/jpeg')).toEqual({
      ok: false,
      code: 'EMPTY_IMAGE',
    });
    // Empty + invalid content-type → still EMPTY_IMAGE (it's checked first).
    expect(validateAvatarBytes(buf(0), 'application/pdf')).toEqual({
      ok: false,
      code: 'EMPTY_IMAGE',
    });
  });
});
