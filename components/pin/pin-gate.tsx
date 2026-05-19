'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setPinAction, unlockDeviceAction } from '@/lib/auth/actions';

type Mode = 'setup' | 'unlock';

interface PinGateProps {
  mode: Mode;
  onUnlocked?: () => void;
}

const PIN_LENGTH = 4;

export function PinGate({ mode, onUnlocked }: PinGateProps) {
  const t = useTranslations('pin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}$/.test(pin)) {
      setError(t(mode === 'setup' ? 'setup.invalidFormat' : 'unlock.wrongPin', { remaining: 0 }));
      return;
    }

    if (mode === 'setup' && pin !== confirmPin) {
      setError(t('setup.mismatch'));
      return;
    }

    startTransition(async () => {
      const result =
        mode === 'setup'
          ? await setPinAction({ pin })
          : await unlockDeviceAction({ pin });

      if (result.ok) {
        toast.success(t(mode === 'setup' ? 'setup.title' : 'unlock.title'));
        onUnlocked?.();
        // Reload so the server-side gate sees the new device session.
        window.location.reload();
      } else if (result.code === 'WRONG_PIN') {
        setError(t('unlock.wrongPin', { remaining: result.attemptsRemaining ?? 0 }));
        setPin('');
      } else if (result.code === 'LOCKED') {
        setError(t('unlock.lockedBody'));
      } else {
        setError(t('setup.invalidFormat'));
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {t(mode === 'setup' ? 'setup.title' : 'unlock.title')}
        </h1>
        {mode === 'setup' ? (
          <p className="text-muted-foreground mt-2 text-sm">{t('setup.subtitle')}</p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pin">{t('setup.pinLabel')}</Label>
          <Input
            id="pin"
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            className="text-center text-2xl tracking-widest"
            autoFocus
          />
        </div>

        {mode === 'setup' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPin">{t('setup.confirmLabel')}</Label>
            <Input
              id="confirmPin"
              type="tel"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
              }
              className="text-center text-2xl tracking-widest"
            />
          </div>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          size="lg"
          disabled={isPending || pin.length !== PIN_LENGTH}
          className="h-14 text-lg"
        >
          {t(mode === 'setup' ? 'setup.submit' : 'unlock.submit')}
        </Button>
      </form>
    </main>
  );
}
