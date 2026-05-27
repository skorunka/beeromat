import { cn } from '@/lib/utils';

// "Beer being poured" loading indicator — chunky mug silhouette
// (handle on the right, bubbly foam cap on top) with amber liquid
// that rises from empty to full on a continuous loop. Inline SVG;
// glass outline + handle + foam all use `currentColor` so the
// spinner inherits the surrounding text color in any button or
// loader context.
//
// Aspect ratio 28x24 (wider than tall because the handle adds width).
// The fill animation lives in app/globals.css (animate-beer-fill)
// and is gated by prefers-reduced-motion — the mug outline + foam
// stay visible so users get a "loading" affordance without motion.

interface BeerSpinnerProps {
  className?: string;
  /** Accessible label announced by screen readers. Defaults to "Loading". */
  label?: string;
}

export function BeerSpinner({ className, label = 'Loading' }: BeerSpinnerProps) {
  return (
    <svg
      viewBox="0 0 28 24"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={label}
      className={cn('inline-block h-5 w-[24px] shrink-0', className)}
    >
      <defs>
        {/* Clip to the mug interior — slightly inset from the outline
            so the rising amber doesn't bleed across the stroke. */}
        <clipPath id="beer-spinner-mug">
          <rect x="3.5" y="9" width="14" height="11" rx="0.8" />
        </clipPath>
      </defs>

      {/* Handle on the right — drawn first so the mug body covers
          where the handle attaches. */}
      <path
        d="M18 11 a 3.2 3.2 0 0 1 0 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Mug body outline */}
      <rect
        x="3"
        y="8.5"
        width="15"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Amber liquid rising — clipped to the mug interior */}
      <g clipPath="url(#beer-spinner-mug)" className="animate-beer-fill">
        <rect x="3" y="9" width="15" height="11" fill="currentColor" opacity="0.75" />
      </g>

      {/* Bubbly foam cap on top of the mug — always visible,
          drawn last so it sits above everything. */}
      <g opacity="0.55">
        <circle cx="5" cy="8" r="2.2" fill="currentColor" />
        <circle cx="8.5" cy="7.2" r="2.4" fill="currentColor" />
        <circle cx="12" cy="7.5" r="2.2" fill="currentColor" />
        <circle cx="15.5" cy="7.5" r="2.4" fill="currentColor" />
        <circle cx="17.5" cy="8.2" r="1.6" fill="currentColor" />
      </g>
    </svg>
  );
}
