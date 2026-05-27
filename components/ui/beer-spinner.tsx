import { Beer } from 'lucide-react';

import { cn } from '@/lib/utils';

// Loading indicator — the same lucide `Beer` icon used by the one-tap
// log button, animated with a tilt-and-pour wiggle so it reads as
// "active". Uses currentColor like every lucide icon, so it inherits
// the surrounding text color (primary-foreground on primary buttons,
// foreground on ghost buttons, etc.).
//
// The animation lives in app/globals.css (animate-beer-pour) and is
// gated by prefers-reduced-motion — the icon stays visible but stops
// moving for users who've opted out.

interface BeerSpinnerProps {
  className?: string;
  /** Accessible label announced by screen readers. Defaults to "Loading". */
  label?: string;
}

export function BeerSpinner({ className, label = 'Loading' }: BeerSpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Beer
        aria-hidden
        className={cn('animate-beer-pour h-5 w-5 shrink-0', className)}
      />
    </span>
  );
}
