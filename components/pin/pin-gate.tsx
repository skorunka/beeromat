'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';

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
  const [revealed, setRevealed] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Sticky submit lock. `isPending` flips back to false the instant the
  // transition's async callback returns — but on the success path that
  // callback fires `window.location.reload()` and returns, leaving a
  // window where the button is re-enabled while the (possibly slow,
  // e.g. Turbopack recompile) reload is still in flight. A second tap
  // there fires a second submit. So we keep this true through the
  // reload and only release it on the retry paths (wrong PIN / locked /
  // bad format). User-reported 2026-06-04.
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PinFormValues>({
    // The active schema depends on mode. Both validate `pin`; only setup
    // also validates `confirmPin`, so the unlock resolver is a structural
    // subset — cast through `unknown` to the form's value shape.
    resolver: zodResolver(
      mode === 'setup' ? pinSetupSchema : pinUnlockSchema,
    ) as unknown as Resolver<PinFormValues>,
    defaultValues: { pin: '', confirmPin: '' },
  });

  // Belt-and-braces autofocus on mount — the PinInput's `autoFocus` prop
  // doesn't reliably get honored by react-hook-form's controller ref, so
  // we focus explicitly via a merged ref. User-reported 2026-05-27.
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    pinInputRef.current?.focus();
  }, []);

  // Unlock auto-submit: once the user types all 4 digits, fire the
  // submit without waiting for the button tap. Setup mode keeps manual
  // submit because there are two fields to fill. The `hasAutoSubmitted`
  // ref prevents a re-fire after a wrong-PIN reset.
  const pinValue = form.watch('pin');
  const hasAutoSubmittedRef = useRef(false);
  const onSubmitRef = useRef<(values: PinFormValues) => void>(() => {});

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
    setSubmitting(true);
    startTransition(async () => {
      const result =
        mode === 'setup'
          ? await setPinAction({ pin: values.pin })
          : await unlockDeviceAction({ pin: values.pin });

      if (result.ok) {
        // No success toast — the page reloads immediately so the toast
        // would only flash before vanishing. The reload itself is the
        // user's success signal (their next screen is the unlocked app).
        // Leave `submitting` set: the reload is in flight and the button
        // must stay disabled until the page actually navigates away.
        onUnlocked?.();
        window.location.reload();
      } else if (result.code === 'WRONG_PIN') {
        setServerError(t('unlock.wrongPin', { remaining: result.attemptsRemaining ?? 0 }));
        form.resetField('pin');
        // Re-enable auto-submit so the next 4-digit fill triggers again.
        hasAutoSubmittedRef.current = false;
        setSubmitting(false);
      } else if (result.code === 'LOCKED') {
        setServerError(t('unlock.lockedBody'));
        setSubmitting(false);
      } else {
        setServerError(t('setup.invalidFormat'));
        setSubmitting(false);
      }
    });
  }

  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (mode !== 'unlock') return;
    if (
      pinValue.length === PIN_LENGTH &&
      !isPending &&
      !submitting &&
      !hasAutoSubmittedRef.current
    ) {
      hasAutoSubmittedRef.current = true;
      void form.handleSubmit((values) => onSubmitRef.current(values))();
    } else if (pinValue.length < PIN_LENGTH) {
      hasAutoSubmittedRef.current = false;
    }
  }, [pinValue, mode, isPending, submitting, form]);

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
                {/* In setup mode the second field has a "PIN ještě jednou"
                    label — without one here the two stacked inputs look
                    asymmetric. In unlock mode there is no second field,
                    and the screen title "Tvůj PIN" already names the
                    input, so the label is omitted there. The PinInput's
                    `ariaLabel` keeps the screen-reader label intact in
                    both modes. */}
                {mode === 'setup' ? <FormLabel>{t('setup.pinLabel')}</FormLabel> : null}
                <FormControl>
                  <PinInput
                    length={PIN_LENGTH}
                    autoFocus
                    autoComplete="one-time-code"
                    name={field.name}
                    ref={(el) => {
                      field.ref(el);
                      pinInputRef.current = el;
                    }}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    ariaLabel={t('setup.pinLabel')}
                    revealed={revealed}
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
                      revealed={revealed}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 self-center text-xs underline"
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            )}
            {revealed ? t('hidePin') : t('showPin')}
          </button>

          {serverError ? (
            <p role="alert" className="text-destructive text-sm">
              {serverError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={isPending || submitting}
            isPending={isPending || submitting}
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
          disabled={isPending || submitting}
          className="text-muted-foreground text-sm underline disabled:opacity-50"
        >
          {t('unlock.forgotPin')}
        </button>
      ) : null}
    </main>
  );
}
