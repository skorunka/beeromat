'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { requestMagicLinkAction, type MagicLinkStatus } from '@/lib/auth/actions';
import { signInSchema, type SignInValues } from '@/lib/validation/auth';

interface SignInFormProps {
  turnstileSiteKey: string;
}

export function SignInForm({ turnstileSiteKey }: SignInFormProps) {
  const t = useTranslations('auth.signIn');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: MagicLinkStatus } | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(values: SignInValues) {
    // The submit button is gated on a Turnstile token; this is a guard.
    if (!turnstileToken) return;
    startTransition(async () => {
      const r = await requestMagicLinkAction({ email: values.email, turnstileToken });
      if (r.ok) setResult({ status: r.data?.status ?? 'rate-limited' });
    });
  }

  function handleRetry() {
    setResult(null);
    setTurnstileToken(null);
    form.reset({ email: '' });
  }

  // Per spec 006 contracts/auth.md: 'sent' and 'rate-limited' render the
  // identical "Link sent" screen — the client must not be able to tell
  // them apart. Only 'not-on-allowlist' gets its own screen.
  if (result && result.status !== 'not-on-allowlist') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">{t('linkSent')}</h1>
        <p className="text-muted-foreground text-sm">{t('linkExpiresIn')}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('useDifferentEmail')}
        </button>
      </main>
    );
  }

  if (result?.status === 'not-on-allowlist') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">{t('notOnListHeadline')}</h1>
        <button
          type="button"
          onClick={handleRetry}
          className="text-muted-foreground mt-2 text-sm underline"
        >
          {t('useDifferentEmail')}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-7">
      {/* The branded welcome hero — club identity and a warm invitation,
          leading straight into the magic-link form below. */}
      <header className="flex flex-col gap-3">
        <BrandMark />
        <h1 className="text-4xl font-extrabold leading-[1.1]">{t('welcomeHeadline')}</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          {t('welcomeTagline')}
        </p>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex w-full flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('emailLabel')}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder={t('emailPlaceholder')}
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {turnstileSiteKey ? (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />
          ) : (
            <p className="text-destructive text-sm">{t('turnstileMissing')}</p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={!turnstileToken || isPending}
            className="h-14 text-lg"
          >
            {t('submit')}
          </Button>
        </form>
      </Form>
    </main>
  );
}
