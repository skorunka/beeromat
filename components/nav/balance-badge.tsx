import type { Route } from 'next';

import { Link } from '@/lib/i18n/navigation';

// Ambient "Tvoje útrata: 380 Kč" pill in the AppHeader. Renders
// null when the balance is zero (no visual noise for the square
// state). Tappable → /tab where the per-row detail lives.
//
// Designed to sit between the clubName and the UserMenu in the
// header's flex row. Truncates on narrow phones rather than
// wrapping (the parent header is already gap-3 + max-w-md).

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
      className="bg-primary/15 text-primary hover:bg-primary/25 inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-bold tabular-nums transition-colors"
    >
      {balanceFormatted}
    </Link>
  );
}
