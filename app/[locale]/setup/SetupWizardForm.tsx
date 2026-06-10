'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { bootstrapClubAction } from '@/app/[locale]/setup/actions';
import { BrandMark } from '@/components/ui/brand-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LocaleDropdown } from '@/components/ui/locale-dropdown';
import { routing } from '@/lib/i18n/routing';
import { onboardingSchema, type OnboardingInput } from '@/lib/validation/onboarding';

// Spec 009 — SetupWizardForm.
//
// Single-screen wizard. Four fields, one submit. On success
// (code: 'OK') the form navigates to /sign-in?bootstrap-sent=1 — the
// user is NOT yet signed in at this point; sign-in completes when
// they click the just-dispatched magic link.
//
// On VALIDATION_FAILED the server-returned fieldErrors are mapped
// onto react-hook-form fields so the inline error UX is identical
// whether validation failed client-side or server-side. On
// BOOTSTRAP_ALREADY_COMPLETE we render a small "someone beat you to
// it — go sign in" panel rather than the form.

export function SetupWizardForm() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [alreadyComplete, setAlreadyComplete] = useState(false);

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      clubName: '',
      currencyCode: '',
      defaultLocale: routing.defaultLocale,
      adminEmail: '',
    },
  });

  function onSubmit(values: OnboardingInput) {
    startTransition(async () => {
      const result = await bootstrapClubAction(values);
      if (result.ok) {
        router.push('/sign-in?bootstrap-sent=1');
        return;
      }
      if (result.code === 'BOOTSTRAP_ALREADY_COMPLETE') {
        setAlreadyComplete(true);
        return;
      }
      // VALIDATION_FAILED — surface server-side issues on the same
      // fields the client schema would have flagged. The server and
      // client share the same Zod schema, so this branch normally
      // fires only if the schema disagrees with itself (e.g. trim
      // boundary) — defensive parity with /sign-in's pattern.
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        const message = messages[0];
        if (!message) continue;
        form.setError(field as keyof OnboardingInput, { message });
      }
    });
  }

  if (alreadyComplete) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark />
        <h2 className="text-2xl font-bold">{t('bootstrapAlreadyCompleteTitle')}</h2>
        <p className="text-muted-foreground">{t('bootstrapAlreadyCompleteBody')}</p>
        <Link
          href="/sign-in"
          className={buttonVariants({ size: 'lg', className: 'mt-2' })}
        >
          {t('bootstrapAlreadyCompleteCta')}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-7">
      <header className="flex flex-col gap-5">
        <BrandMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight leading-[0.95] text-balance sm:text-5xl md:text-6xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed text-balance max-w-prose">
            {t('subtitle')}
          </p>
        </div>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex w-full flex-col gap-4">
        <FormField
          control={form.control}
          name="clubName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('clubNameLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="organization"
                  placeholder={t('clubNamePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currencyCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('currencyLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  inputMode="text"
                  maxLength={3}
                  className="uppercase"
                  placeholder={t('currencyPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('currencyHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultLocale"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('defaultLocaleLabel')}</FormLabel>
              <FormControl>
                {/* Shared LocaleDropdown — flag + endonym ("Čeština" /
                    "English") so a first-time admin sees the languages
                    by name, not bare locale codes. Same shape as the
                    admin config locale switcher. */}
                <LocaleDropdown value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="adminEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('adminEmailLabel')}</FormLabel>
              <FormControl>
                <Input
                  // type="email" is a mobile-keyboard hint only — the
                  // Zod schema is the validation authority. Native
                  // validation stays off (constitution forms:check).
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t('adminEmailPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('adminEmailHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

          <Button type="submit" size="lg" disabled={isPending} isPending={isPending} className="mt-2 h-14 text-lg">
            {isPending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </Form>
    </main>
  );
}
