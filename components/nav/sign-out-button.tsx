'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { signOutDeviceAction } from '@/lib/auth/actions';

// Icon-only sign-out affordance for the home header. Sits inline next
// to the language switcher. Calls the existing signOutDeviceAction
// (drops device_sessions row + DEVICE_ID cookie + Better Auth
// session) and hard-navigates to /sign-in so the new server-side
// gate sees a logged-out state.
//
// The visible glyph is the lucide LogOut icon; the accessible label
// ("Sign out" / "Odhlásit") lives on aria-label so screen readers
// announce the same thing the visual icon means.
export function SignOutButton() {
  const t = useTranslations('auth');
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOutDeviceAction();
      window.location.href = '/sign-in';
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={t('signOut')}
      className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" aria-hidden />
    </button>
  );
}
