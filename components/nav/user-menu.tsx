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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Endonyms: each language is labelled in its own script ("Čeština",
// "English"). Standard convention for language pickers (Wikipedia,
// GitHub, etc.) — the absent-member persona (Standa, CS-only) sees
// his language by name regardless of the current UI locale.
const LOCALE_LABEL: Record<string, string> = {
  cs: 'Čeština',
  en: 'English',
};

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
        {/* Language picker — native dropdown radio rows (one per
            locale) with a check mark on the active one. Matches the
            visual weight of the surrounding text rows (Account, Sign
            out); the previous 2-tile button grid was a visual outlier
            in the dropdown. */}
        <DropdownMenuRadioGroup
          value={active}
          onValueChange={switchTo}
          aria-label={t('nav.language')}
        >
          {routing.locales.map((loc) => (
            <DropdownMenuRadioItem key={loc} value={loc} disabled={isPending}>
              {LOCALE_LABEL[loc] ?? loc.toUpperCase()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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
