'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { signOutDeviceAction } from '@/lib/auth/actions';

// Sign-out control for the account hub. Ends the Better-Auth session
// + device session, then sends the member to /sign-in. Styled as a
// real destructive button (was a ghost card-row originally when it
// sat alongside the Historie plateb link; that link is gone now, so
// the button is the only thing in the slot and needs to look the
// part).
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
      variant="destructive"
      size="lg"
      disabled={isPending}
      isPending={isPending}
      onClick={handleSignOut}
      className="w-full"
    >
      <LogOut aria-hidden />
      {t('signOut')}
    </Button>
  );
}
