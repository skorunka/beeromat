import { BrandMark } from '@/components/ui/brand-mark';
import { UserMenu } from '@/components/nav/user-menu';

// Global header for every authenticated (app)/* page. Brand + active
// club name on the left, user-avatar menu on the right.
//
// The user menu collapses language-switching + sign-out + the future
// Account link into one dropdown trigger so the club name has room
// to breathe — narrow phones could otherwise truncate it to
// uselessness when CS/EN/sign-out were all inline.
export function AppHeader({
  clubName,
  displayName,
  email,
}: {
  clubName: string;
  displayName: string;
  email: string;
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
      <UserMenu displayName={displayName} email={email} />
    </header>
  );
}
