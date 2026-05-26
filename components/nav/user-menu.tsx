'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleUser } from 'lucide-react';

import { Link, usePathname, useRouter } from '@/lib/i18n/navigation';
import { setLocaleCookie } from '@/lib/i18n/actions';
import { routing } from '@/lib/i18n/routing';
import { signOutDeviceAction } from '@/lib/auth/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Top-right account menu: collapses what used to be the inline
// LanguageSwitcher + SignOutButton into a single avatar trigger so
// the AppHeader has room for the club name.
//
// Menu items: identity header (display name + email), Account link,
// Language toggle (inline CS/EN), Sign out.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UserMenu({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const t = useTranslations();
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: string) {
    if (locale === active || isPending) return;
    startTransition(async () => {
      await setLocaleCookie(locale);
      router.replace(pathname, { locale });
    });
  }

  function handleSignOut() {
    startTransition(async () => {
      await signOutDeviceAction();
      window.location.href = '/sign-in';
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('nav.userMenu')}
        disabled={isPending}
        className="bg-primary/15 text-primary hover:bg-primary/25 focus-visible:ring-ring/50 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
      >
        {displayName.trim() ? (
          <span aria-hidden>{initials(displayName)}</span>
        ) : (
          <CircleUser aria-hidden className="h-5 w-5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-56">
        {/* Identity header — plain div (not DropdownMenuLabel) because
            the latter is a GroupLabel that requires a Group parent. */}
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <span className="text-sm font-medium leading-tight">{displayName}</span>
          <span className="text-muted-foreground truncate text-xs leading-tight">
            {email}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          {t('nav.account')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div
          className="text-muted-foreground px-2 py-1 text-xs font-normal uppercase tracking-wider"
          aria-hidden
        >
          {t('nav.language')}
        </div>
        <div className="grid grid-cols-2 gap-1 px-1 pb-1" role="group" aria-label={t('nav.language')}>
          {routing.locales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => switchTo(loc)}
              disabled={isPending}
              aria-current={loc === active ? 'true' : undefined}
              className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                loc === active
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-foreground'
              }`}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isPending}
          className="text-destructive focus:text-destructive"
        >
          {t('auth.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
