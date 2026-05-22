'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

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
import { requestMagicLinkAction } from '@/lib/auth/actions';
import { signInSchema, type SignInValues } from '@/lib/validation/auth';

interface SignInFormProps {
  turnstileSiteKey: string;
}

export function SignInForm({ turnstileSiteKey }: SignInFormProps) {
  const t = useTranslations('auth.signIn');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(values: SignInValues) {
    // The submit button is gated on a Turnstile token; this is a guard.
    if (!turnstileToken) return;
    startTransition(async () => {
      await requestMagicLinkAction({ email: values.email, turnstileToken });
      setSent(true);
    });
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">{t('linkSent')}</h1>
        <p className="text-muted-foreground">{t('checkInbox')}</p>
        <p className="text-muted-foreground text-sm">{t('linkExpiresIn')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

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

          <p className="text-muted-foreground text-xs">{t('checkInbox')}</p>
        </form>
      </Form>
    </main>
  );
}
