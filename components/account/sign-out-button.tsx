'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signOutDeviceAction } from '@/lib/auth/actions';

// Sign-out control for the account hub (v1.3 — UX review F15). Ends the
// Better-Auth session and the device session, then sends the member to
// the signed-out entry point (a fresh magic-link sign-in).
export function SignOutButton() {
  const t = useTranslations('auth');
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOutDeviceAction();
      window.location.href = '/sign-in';
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={isPending}
      onClick={handleSignOut}
      className="h-auto min-h-12 w-full justify-start rounded-none px-4 py-3 text-sm font-medium"
    >
      {t('signOut')}
    </Button>
  );
}
