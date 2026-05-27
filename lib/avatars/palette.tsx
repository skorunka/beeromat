import type { ReactNode } from 'react';

// Spec 020 — fixed avatar palette. Members pick one of these keys
// (or null = "use initials"); the renderer maps the key to inline
// SVG content. Inline SVG (not emoji) because Windows ships no
// flag-emoji glyphs and several others render inconsistently —
// FlagIcon precedent (components/ui/flag-icon.tsx) applies here too.
//
// All glyphs use a 0 0 24 24 viewBox and `currentColor` for fills,
// so they inherit the surrounding circle's text color (primary
// amber) for theme-aware tinting in both light + dark modes.
//
// Add/remove keys here in ONE place; the validator + the picker
// pick up the change automatically. If a member's stored key is
// removed in a later version, the renderer's null fallback kicks
// in (defensive — see <MemberAvatar /> in components/ui/).

export const AVATAR_KEYS = [
  'beer-mug',
  'tennis-ball',
  'trophy',
  'lightning',
  'target',
  'star',
  'heart',
  'sparkle',
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

interface Glyph {
  viewBox: string;
  body: ReactNode;
}

export const GLYPHS: Record<AvatarKey, Glyph> = {
  'beer-mug': {
    viewBox: '0 0 24 24',
    body: (
      <>
        {/* D-handle on the right — drawn first so the mug body
            covers where the handle meets it */}
        <path
          d="M16 12 c 3.5 0 4.5 1.5 4.5 3.5 s -1 3.5 -4.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Mug body — solid amber tankard, slightly rounded bottom */}
        <rect x="4.5" y="9" width="11.5" height="13" rx="1.5" fill="currentColor" />
        {/* Glass highlight — thin bright stripe down the left side */}
        <rect
          x="6"
          y="11"
          width="1"
          height="9"
          rx="0.5"
          fill="var(--background)"
          opacity="0.35"
        />
        {/* Foam cap — overhanging bubbles, slightly lighter via opacity */}
        <g opacity="0.65">
          <circle cx="6" cy="8.5" r="2.2" fill="currentColor" />
          <circle cx="9.5" cy="7" r="2.5" fill="currentColor" />
          <circle cx="13" cy="7.5" r="2.2" fill="currentColor" />
          <circle cx="15.5" cy="8.5" r="1.6" fill="currentColor" />
        </g>
      </>
    ),
  },
  'tennis-ball': {
    viewBox: '0 0 24 24',
    body: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        {/* seam curves */}
        <path
          d="M4 9 Q12 13 20 9"
          fill="none"
          stroke="var(--background)"
          strokeWidth="1.2"
        />
        <path
          d="M4 15 Q12 11 20 15"
          fill="none"
          stroke="var(--background)"
          strokeWidth="1.2"
        />
      </>
    ),
  },
  trophy: {
    viewBox: '0 0 24 24',
    body: (
      <>
        {/* cup */}
        <path d="M8 4 h8 v6 a4 4 0 0 1 -8 0 z" fill="currentColor" />
        {/* handles */}
        <path
          d="M8 5 h-2 a2 2 0 0 0 0 4 h2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M16 5 h2 a2 2 0 0 1 0 4 h-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        {/* stem */}
        <rect x="11" y="14" width="2" height="3" fill="currentColor" />
        {/* base */}
        <rect x="7" y="17" width="10" height="3" rx="1" fill="currentColor" />
      </>
    ),
  },
  lightning: {
    viewBox: '0 0 24 24',
    body: (
      <path
        d="M13 2 L5 13 h6 l-2 9 l10-13 h-6 l2-7 z"
        fill="currentColor"
      />
    ),
  },
  target: {
    viewBox: '0 0 24 24',
    body: (
      <>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <circle cx="12" cy="12" r="6" fill="var(--background)" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </>
    ),
  },
  star: {
    viewBox: '0 0 24 24',
    body: (
      <path
        d="M12 2 L14.7 9 L22 9.5 L16.3 14.2 L18.2 21.5 L12 17.5 L5.8 21.5 L7.7 14.2 L2 9.5 L9.3 9 Z"
        fill="currentColor"
      />
    ),
  },
  heart: {
    viewBox: '0 0 24 24',
    body: (
      <path
        d="M12 21 C 5 16 2 12 2 8 a5 5 0 0 1 10 -2 a5 5 0 0 1 10 2 c 0 4 -3 8 -10 13 z"
        fill="currentColor"
      />
    ),
  },
  sparkle: {
    viewBox: '0 0 24 24',
    body: (
      <>
        {/* main sparkle */}
        <path
          d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"
          fill="currentColor"
        />
        {/* small sparkle */}
        <path
          d="M19 4 L19.5 6 L21.5 6.5 L19.5 7 L19 9 L18.5 7 L16.5 6.5 L18.5 6 Z"
          fill="currentColor"
        />
      </>
    ),
  },
};
