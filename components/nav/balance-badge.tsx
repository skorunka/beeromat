import type { Route } from 'next';
import { Coins } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

// Ambient "you owe N Kč" pill in the AppHeader. Renders null when the
// balance is zero (no visual noise for the square state). Tappable
// → /tab where the per-row detail lives.
//
// Designed to grab attention without nagging:
//   - Full amber bg (not the muted /15 tint) so it pops against the
//     header. Bricolage Grotesque bold + tabular-nums for crisp digits.
//   - A jangling-coins icon to the left of the amount. The icon does
//     a small periodic wiggle (~6s cycle, mostly still then a quick
//     wobble) — the "kinda funny" personality the user asked for,
//     done with a single CSS keyframe (animate-balance-wiggle in
//     globals.css) so prefers-reduced-motion disables it.
//   - On hover, the whole pill scales up slightly and the coin spins,
//     a press affordance that says "tap me to see the detail".
//
// Sits between the stacked brand+club group on the left and the
// UserMenu avatar on the right; the header is gap-3 + max-w-md so
// the badge truncates rather than wrapping on narrow phones.

export function BalanceBadge({
  balanceFormatted,
  ariaLabel,
}: {
  balanceFormatted: string | null;
  ariaLabel: string;
}) {
  if (!balanceFormatted) return null;
  return (
    <Link
      href={'/tab' as Route}
      aria-label={ariaLabel}
      className="group bg-primary text-primary-foreground ring-primary/20 hover:bg-primary/90 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums shadow-sm ring-1 transition-all duration-150 hover:scale-105 active:scale-95"
    >
      <Coins
        aria-hidden
        className="animate-balance-wiggle h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180 motion-reduce:group-hover:rotate-0"
      />
      {balanceFormatted}
    </Link>
  );
}
