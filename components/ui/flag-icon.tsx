import type { SVGProps } from 'react';

import { cn } from '@/lib/utils';

// Inline SVG flag glyphs. Used by the language picker because
// Windows ships no flag-emoji glyphs (Regional Indicator Symbols
// fall back to the bare CZ/GB letters), so the emoji approach
// broke for the bulk of our users. SVG renders identically across
// every platform and stays sharp at any size.
//
// Add new locales by extending the FLAG_PATHS map below — keep the
// canonical aspect ratio in the viewBox.

interface FlagIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  code: string;
}

export function FlagIcon({ code, className, ...props }: FlagIconProps) {
  const flag = FLAGS[code];
  if (!flag) return null;
  return (
    <svg
      viewBox={flag.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
      className={cn(
        'inline-block h-3.5 w-auto shrink-0 rounded-[1px] ring-1 ring-black/10',
        className,
      )}
      {...props}
    >
      {flag.body}
    </svg>
  );
}

const FLAGS: Record<string, { viewBox: string; body: React.ReactNode }> = {
  cs: {
    viewBox: '0 0 6 4',
    body: (
      <>
        <rect width="6" height="2" fill="#fff" />
        <rect y="2" width="6" height="2" fill="#d7141a" />
        <path d="M0,0 L3,2 L0,4 Z" fill="#11457e" />
      </>
    ),
  },
  en: {
    viewBox: '0 0 60 30',
    body: (
      <>
        <clipPath id="flag-en-t">
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath="url(#flag-en-t)"
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </>
    ),
  },
};
