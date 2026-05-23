'use client';

import { useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PinInput } from '@/components/ui/pin-input';
import { setPinAction, signOutDeviceAction, unlockDeviceAction } from '@/lib/auth/actions';
import { pinSetupSchema, pinUnlockSchema } from '@/lib/validation/auth';

type Mode = 'setup' | 'unlock';

interface PinGateProps {
  mode: Mode;
  onUnlocked?: () => void;
}

interface PinFormValues {
  pin: string;
  confirmPin: string;
}

const PIN_LENGTH = 4;

export function PinGate({ mode, onUnlocked }: PinGateProps) {
  const t = useTranslations('pin');
  // Server-side outcomes (wrong PIN with attempts-remaining, lock-out) are
  // not field-validation errors — they carry a runtime count and arrive
  // after a round trip, so they render as a distinct form-level message,
  // separate from the react-hook-form field errors (FR-012).
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<PinFormValues>({
    // The active schema depends on mode. Both validate `pin`; only setup
    // also validates `confirmPin`, so the unlock resolver is a structural
    // subset — cast through `unknown` to the form's value shape.
    resolver: zodResolver(
      mode === 'setup' ? pinSetupSchema : pinUnlockSchema,
    ) as unknown as Resolver<PinFormValues>,
    defaultValues: { pin: '', confirmPin: '' },
  });

  // US5 — escape hatch before lock-out: clear this device's session +
  // sign out, then go to /sign-in for a fresh magic link. Spends no
  // PIN attempts.
  function handleForgotPin() {
    startTransition(async () => {
      await signOutDeviceAction();
      window.location.href = '/sign-in';
    });
  }

  function onSubmit(values: PinFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result =
        mode === 'setup'
          ? await setPinAction({ pin: values.pin })
          : await unlockDeviceAction({ pin: values.pin });

      if (result.ok) {
        toast.success(t(mode === 'setup' ? 'setup.title' : 'unlock.title'));
        onUnlocked?.();
        // Reload so the server-side gate sees the new device session.
        window.location.reload();
      } else if (result.code === 'WRONG_PIN') {
        setServerError(t('unlock.wrongPin', { remaining: result.attemptsRemaining ?? 0 }));
        form.resetField('pin');
      } else if (result.code === 'LOCKED') {
        setServerError(t('unlock.lockedBody'));
      } else {
        setServerError(t('setup.invalidFormat'));
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">
          {t(mode === 'setup' ? 'setup.title' : 'unlock.title')}
        </h1>
        {mode === 'setup' ? (
          <p className="text-muted-foreground mt-2 text-sm">{t('setup.subtitle')}</p>
        ) : null}
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex w-full flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="pin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('setup.pinLabel')}</FormLabel>
                <FormControl>
                  <PinInput
                    length={PIN_LENGTH}
                    autoFocus
                    autoComplete="one-time-code"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    ariaLabel={t('setup.pinLabel')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {mode === 'setup' ? (
            <FormField
              control={form.control}
              name="confirmPin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('setup.confirmLabel')}</FormLabel>
                  <FormControl>
                    <PinInput
                      length={PIN_LENGTH}
                      autoComplete="off"
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      ariaLabel={t('setup.confirmLabel')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {serverError ? (
            <p role="alert" className="text-destructive text-sm">
              {serverError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="h-14 text-lg"
          >
            {t(mode === 'setup' ? 'setup.submit' : 'unlock.submit')}
          </Button>
        </form>
      </Form>

      {mode === 'unlock' ? (
        <button
          type="button"
          onClick={handleForgotPin}
          disabled={isPending}
          className="text-muted-foreground text-sm underline disabled:opacity-50"
        >
          {t('unlock.forgotPin')}
        </button>
      ) : null}
    </main>
  );
}
