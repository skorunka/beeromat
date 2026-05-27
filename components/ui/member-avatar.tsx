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
// Spec 023 — added `size` prop with three variants:
//   default (h-9 w-9): AppHeader user-menu, /admin/members roster.
//                      Pre-spec-023 behavior preserved.
//   row     (h-8 w-8): list-card rows on /admin/pending.
//   inline  (h-5 w-5): text-flow attribution on /tab, /bet, /history/[id].
// `className` still appends so call sites can nudge spacing/margin.

export type MemberAvatarSize = 'default' | 'row' | 'inline';

interface MemberAvatarProps {
  avatarKey: string | null;
  displayName: string;
  /** Set when this member has an uploaded avatar — typically built
   *  via `avatarUploadUrl(memberId, member.avatarUploadAt)`. When
   *  non-null, the image wins over every other fallback. */
  uploadUrl?: string | null;
  size?: MemberAvatarSize;
  className?: string;
}

const WRAPPER_SIZE: Record<MemberAvatarSize, string> = {
  default: 'h-9 w-9 text-sm',
  row: 'h-8 w-8 text-sm',
  inline: 'h-5 w-5 text-[10px]',
};

// At h-5 the default h-5 glyph/icon would overflow the circle; shrink it.
const INNER_SIZE: Record<MemberAvatarSize, string> = {
  default: 'h-5 w-5',
  row: 'h-5 w-5',
  inline: 'h-3 w-3',
};

export function MemberAvatar({
  avatarKey,
  displayName,
  uploadUrl,
  size = 'default',
  className,
}: MemberAvatarProps) {
  const validKey: AvatarKey | null =
    avatarKey && isValidAvatarKey(avatarKey) ? avatarKey : null;

  const trimmed = displayName.trim();

  return (
    <span
      className={cn(
        'bg-primary/15 text-primary inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        WRAPPER_SIZE[size],
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
          className={INNER_SIZE[size]}
        >
          {GLYPHS[validKey].body}
        </svg>
      ) : trimmed ? (
        <span aria-hidden>{initials(trimmed)}</span>
      ) : (
        <CircleUser aria-hidden className={INNER_SIZE[size]} />
      )}
    </span>
  );
}
