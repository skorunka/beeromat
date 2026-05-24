'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { signOutDeviceAction } from '@/lib/auth/actions';

// Small text-link sign-out affordance for the home header. Calls the
// existing signOutDeviceAction (drops device_sessions row + cookie +
// Better Auth session) and hard-navigates to /sign-in so the new
// server-side gate sees a logged-out state.
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
      className="text-muted-foreground hover:text-foreground text-xs font-medium underline disabled:opacity-50"
    >
      {t('signOut')}
    </button>
  );
}
