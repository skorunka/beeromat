import { cn } from '@/lib/utils';

// "Beer being poured" loading indicator. A pint-glass outline + an
// amber fill that rises from empty to full on a continuous loop.
// Inline SVG (no asset hosting), uses `currentColor` for the glass
// outline so it inherits the surrounding text color — drop into any
// button or full-page loader and it picks up the right tint.
//
// Aspect ratio is tall (24x28) to match a real pint silhouette. The
// fill animation lives in app/globals.css (animate-beer-fill) and is
// disabled under prefers-reduced-motion — the glass outline still
// shows so users get a visible "loading" affordance without motion.

interface BeerSpinnerProps {
  className?: string;
  /** Accessible label announced by screen readers. Defaults to "Loading". */
  label?: string;
}

export function BeerSpinner({ className, label = 'Loading' }: BeerSpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 28"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={label}
      className={cn('inline-block h-5 w-[18px] shrink-0', className)}
    >
      <defs>
        {/* Clip to the glass interior — slightly inset from the outline
            so the fill doesn't bleed over the stroke. */}
        <clipPath id="beer-spinner-glass">
          <path d="M6.6 4.5 h10.8 l-1.45 20.2 a1.5 1.5 0 0 1 -1.5 1.2 h-5.1 a1.5 1.5 0 0 1 -1.5 -1.2 z" />
        </clipPath>
      </defs>

      {/* Amber liquid + foam, rising from below. The group is sized
          to the full glass interior; the keyframe translates it from
          fully-below to fully-in-place on each cycle. */}
      <g clipPath="url(#beer-spinner-glass)" className="animate-beer-fill">
        {/* Foam (lighter strip on top of the liquid) */}
        <rect x="6" y="4" width="12" height="2.5" fill="currentColor" opacity="0.45" />
        {/* Amber body */}
        <rect x="6" y="6.5" width="12" height="22" fill="currentColor" opacity="0.7" />
      </g>

      {/* Glass outline — drawn last so it sits above the fill. */}
      <path
        d="M6 4 h12 l-1.5 21 a2 2 0 0 1 -2 1.5 h-5 a2 2 0 0 1 -2 -1.5 z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
