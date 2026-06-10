import type { Route } from 'next';
import { Clock, Coins } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

// Ambient "you owe N Kč" pill in the AppHeader. Renders null when the
// balance is zero (no visual noise for the square state). Tappable
// → /tab where the per-row detail lives.
//
// THEATRICAL VERSION — four layered CSS animations (defined in
// app/globals.css, all gated by prefers-reduced-motion):
//   1. animate-balance-halo — pulsing amber glow behind the pill
//   2. animate-balance-coin-bounce — the Coins icon CONSTANTLY hops
//      + spins (1.6s linear loop, no rest phase). Per user direction:
//      "annoying enough to make you settle." No still moment.
//   3-5. animate-balance-money-fly / -mid / -late — three 💸 particles
//      offset by thirds of a 3s cycle, so the trail is continuous.
//      First drifts up-right, second up-left (mirrored), third
//      straight up — three divergent paths out of the pill.
//
// On hover the pill itself scales 105% and the coin does an extra
// 180° spin — press affordance + "tap me" signal.
//
// Sits between the stacked brand+club group on the left and the
// UserMenu avatar on the right; the header is gap-3 + max-w-md so
// the pill bounds truncate gracefully on narrow phones (particles
// are absolute-positioned and don't affect layout).

export function BalanceBadge({
  balanceFormatted,
  ariaLabel,
  awaiting = false,
}: {
  balanceFormatted: string | null;
  ariaLabel: string;
  /** A claimed-but-unconfirmed payment covers the balance — render a
   *  calm, non-animated "awaiting confirmation" pill instead of the
   *  theatrical nag, so a member who already paid isn't told to settle
   *  again. */
  awaiting?: boolean;
}) {
  if (!balanceFormatted) return null;

  // Calm variant: muted pill, a clock, and NONE of the four looping
  // animations — the member has paid; the signal is "hang tight", not
  // "go settle".
  if (awaiting) {
    return (
      <Link
        href={'/tab' as Route}
        aria-label={ariaLabel}
        className="bg-muted text-muted-foreground hover:bg-muted/80 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium tabular-nums transition-colors"
      >
        <Clock aria-hidden className="h-3.5 w-3.5" />
        {balanceFormatted}
      </Link>
    );
  }

  return (
    <div className="relative inline-flex shrink-0 items-center">
      {/* Pulsing halo behind the pill (blurred amber circle). */}
      <span
        aria-hidden
        className="animate-balance-halo bg-primary/50 pointer-events-none absolute inset-0 -z-10 rounded-full blur-md"
      />

      <Link
        href={'/tab' as Route}
        aria-label={ariaLabel}
        className="group bg-primary text-primary-foreground ring-primary/30 hover:bg-primary/90 relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums shadow-md ring-1 transition-all duration-150 hover:scale-105 active:scale-95"
      >
        <Coins
          aria-hidden
          className="animate-balance-coin-bounce h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180 motion-reduce:group-hover:rotate-0"
        />
        {balanceFormatted}
      </Link>

      {/* Flying money particles — three 💸 emoji offset by thirds of
          the cycle, so the trail is continuous (always money in
          flight). First drifts up-right, second up-left (mirrored
          via scaleX), third straight up. pointer-events-none so they
          never block the Link. */}
      <span
        aria-hidden
        className="animate-balance-money-fly pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-sm leading-none select-none"
      >
        💸
      </span>
      <span
        aria-hidden
        className="animate-balance-money-fly-mid pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-sm leading-none select-none"
      >
        💸
      </span>
      <span
        aria-hidden
        className="animate-balance-money-fly-late pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-sm leading-none select-none"
      >
        💸
      </span>
    </div>
  );
}
