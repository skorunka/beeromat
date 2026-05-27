'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signOutAllDevicesAction } from '@/lib/auth/actions';

// Spec 010 stub closure — the "brzy" badge on the sign-out-all row
// is gone. Tap shows an inline confirm step (no separate dialog) and
// then drops every device_sessions row for the user. The whole flow
// lives in this client component; the row in /account just renders
// it.

export function SignOutAllButton() {
  const t = useTranslations('account.signOutAll');
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await signOutAllDevicesAction();
      // Any device that's currently unlocked will be kicked back to
      // the magic-link flow on next request. Hard-reload to /sign-in
      // immediately so the actor isn't left on a stale page that
      // 401s on its next server interaction.
      window.location.href = '/sign-in';
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        {t('cta')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{t('confirm')}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleConfirm}
          disabled={isPending}
          isPending={isPending}
          className="flex-1"
        >
          {t('confirmCta')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
