import { CircleUser } from 'lucide-react';

import { GLYPHS, type AvatarKey } from '@/lib/avatars/palette';
import { isValidAvatarKey } from '@/lib/avatars/validate';
import { initials } from '@/lib/avatars/initials';
import { cn } from '@/lib/utils';

// Spec 020 + spec 021 — the canonical renderer for a member's
// identity glyph. Render-path precedence:
//   1. uploadUrl is set                      → render <img> (spec 021)
//   2. Valid avatarKey                       → matching inline SVG glyph
//   3. Non-empty displayName                 → two-letter initials
//   4. Empty displayName                     → <CircleUser /> lucide fallback
//
// Server-safe (no 'use client'). Unknown avatarKey falls through to
// initials so renaming/removing a palette entry can't crash anywhere.
//
// Default sizing matches the AppHeader user-menu trigger (h-9 w-9).
// `className` lets call sites override for compact contexts.

interface MemberAvatarProps {
  avatarKey: string | null;
  displayName: string;
  /** Set when this member has an uploaded avatar — typically built
   *  via `avatarUploadUrl(memberId, member.avatarUploadAt)`. When
   *  non-null, the image wins over every other fallback. */
  uploadUrl?: string | null;
  className?: string;
}

export function MemberAvatar({
  avatarKey,
  displayName,
  uploadUrl,
  className,
}: MemberAvatarProps) {
  const validKey: AvatarKey | null =
    avatarKey && isValidAvatarKey(avatarKey) ? avatarKey : null;

  const trimmed = displayName.trim();

  return (
    <span
      className={cn(
        'bg-primary/15 text-primary inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold',
        className,
      )}
    >
      {uploadUrl ? (
        // The image fills the circle; object-cover keeps the aspect
        // sensible even though the upload pipeline always saves a
        // square JPEG. Empty alt because the avatar is decorative —
        // the member's display name accompanies it everywhere it's
        // shown (SC-006 from spec 020).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadUrl} alt="" className="h-full w-full object-cover" />
      ) : validKey ? (
        <svg
          viewBox={GLYPHS[validKey].viewBox}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="h-5 w-5"
        >
          {GLYPHS[validKey].body}
        </svg>
      ) : trimmed ? (
        <span aria-hidden>{initials(trimmed)}</span>
      ) : (
        <CircleUser aria-hidden className="h-5 w-5" />
      )}
    </span>
  );
}
