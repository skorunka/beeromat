// Spec 021 — server-side guards for an incoming avatar upload.
// Client pre-resizes + sends ~50–150 KB JPEG; these checks are
// defense-in-depth (a bypassed client, a manual API call, etc.).

export const AVATAR_MAX_BYTES = 262_144; // 256 KB

export const AVATAR_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AvatarValidationFailure =
  | 'OVERSIZE'
  | 'INVALID_CONTENT_TYPE'
  | 'EMPTY_IMAGE';

export type AvatarValidationResult =
  | { ok: true }
  | { ok: false; code: AvatarValidationFailure };

export function validateAvatarBytes(
  buf: Uint8Array,
  contentType: string,
): AvatarValidationResult {
  if (buf.length === 0) {
    return { ok: false, code: 'EMPTY_IMAGE' };
  }
  if (buf.length > AVATAR_MAX_BYTES) {
    return { ok: false, code: 'OVERSIZE' };
  }
  if (!(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, code: 'INVALID_CONTENT_TYPE' };
  }
  return { ok: true };
}
