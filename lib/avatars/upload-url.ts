// Spec 021 — builds the public URL the renderer uses to fetch a
// member's uploaded avatar. The version (epoch ms) is the
// cache-buster: any upload change advances members.avatar_upload_at,
// which advances v=..., which invalidates the browser cache for
// the prior URL.

export function avatarUploadUrl(
  memberId: string,
  version: Date | null,
): string | null {
  if (!version) return null;
  return `/api/avatar/${memberId}?v=${version.getTime()}`;
}
