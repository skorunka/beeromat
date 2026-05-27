import { CircleUser } from 'lucide-react';

import { GLYPHS, type AvatarKey } from '@/lib/avatars/palette';
import { isValidAvatarKey } from '@/lib/avatars/validate';
import { initials } from '@/lib/avatars/initials';
import { cn } from '@/lib/utils';

// Spec 020 — the canonical renderer for a member's identity glyph.
// Picks one of three render paths in order:
//   1. Valid avatarKey → the matching inline SVG glyph
//   2. Non-empty displayName → two-letter initials
//   3. Empty displayName → <CircleUser /> lucide fallback
//
// Server-safe (no 'use client'). The unknown-key path falls through
// to (2) so renaming/removing a palette entry can't crash anywhere.
//
// Default sizing matches the existing AppHeader user-menu trigger
// (h-9 w-9). `className` lets call sites override for compact
// contexts later.

interface MemberAvatarProps {
  avatarKey: string | null;
  displayName: string;
  className?: string;
}

export function MemberAvatar({ avatarKey, displayName, className }: MemberAvatarProps) {
  const validKey: AvatarKey | null =
    avatarKey && isValidAvatarKey(avatarKey) ? avatarKey : null;

  const trimmed = displayName.trim();

  return (
    <span
      className={cn(
        'bg-primary/15 text-primary inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        className,
      )}
    >
      {validKey ? (
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
