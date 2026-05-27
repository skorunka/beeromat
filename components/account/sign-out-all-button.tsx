'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signOutAllDevicesAction } from '@/lib/auth/actions';

// Spec 010 stub closure — the "brzy" badge on the sign-out-all row
// is gone. Renders the WHOLE row, not just the button: closed shows
// label-left + Sign-out-everywhere button on the right; expanded
// confirm shows the same label as a title at the top with the
// confirm prompt + Yes/Cancel below (same pattern as ChangePinForm —
// no "labels stranded on the left while the button takes the right"
// L-shape).

export function SignOutAllButton() {
  const t = useTranslations('account.signOutAll');
  const tAccount = useTranslations('account');
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
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{tAccount('signOutAllLabel')}</span>
          <span className="text-muted-foreground text-xs">{tAccount('signOutAllHint')}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          {t('cta')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{tAccount('signOutAllLabel')}</span>
        <span className="text-muted-foreground text-xs">{t('confirm')}</span>
      </div>
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
