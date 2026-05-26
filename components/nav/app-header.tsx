import { BalanceBadge } from '@/components/nav/balance-badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { UserMenu } from '@/components/nav/user-menu';

// Global header for every authenticated (app)/* page. Brand + active
// club name on the left, balance pill + user-avatar menu on the right.
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
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark />
        <span aria-hidden className="text-muted-foreground/50 text-xs leading-none">
          ·
        </span>
        <span className="text-muted-foreground truncate text-sm font-medium">
          {clubName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <BalanceBadge balanceFormatted={balanceFormatted} ariaLabel={balanceAriaLabel} />
        <UserMenu displayName={displayName} email={email} />
      </div>
    </header>
  );
}
