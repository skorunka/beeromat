import type { Route } from 'next';

import { BalanceBadge } from '@/components/nav/balance-badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { UserMenu } from '@/components/nav/user-menu';
import { Link } from '@/lib/i18n/navigation';

// Global header for every authenticated (app)/* page. Brand + active
// club name on the left, balance pill + user-avatar menu on the right.
//
// The brand+club group is a Link to `/` — web convention: tapping the
// logo / brand name goes home (BACKLOG.md item shipped 2026-05-26).
//
// `balanceFormatted` is null when the member is square — the
// BalanceBadge then renders null, keeping the header uncluttered.
// `balanceAriaLabel` is the read-aloud equivalent ("Tvoje útrata
// 380 Kč") because the visible pill is just the amount.
export function AppHeader({
  clubName,
  displayName,
  email,
  balanceFormatted,
  balanceAriaLabel,
}: {
  clubName: string;
  displayName: string;
  email: string;
  balanceFormatted: string | null;
  balanceAriaLabel: string;
}) {
  return (
    <header className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pt-5">
      {/* Brand stacked on top of the club name. The two lines together
          occupy roughly the height of the UserMenu avatar on the right,
          so the row aligns visually. Stacking gives the club name the
          full header width to truncate against — important when the
          balance pill takes a chunk of the right side. */}
      <Link
        href={'/' as Route}
        className="hover:text-foreground flex min-w-0 flex-col"
      >
        <BrandMark />
        <span className="text-muted-foreground truncate text-sm font-medium leading-tight">
          {clubName}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <BalanceBadge balanceFormatted={balanceFormatted} ariaLabel={balanceAriaLabel} />
        <UserMenu displayName={displayName} email={email} />
      </div>
    </header>
  );
}
