'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { updateClubConfigAction } from '@/app/[locale]/(app)/admin/config/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlagIcon } from '@/components/ui/flag-icon';
import { ChevronDown } from 'lucide-react';
import { routing } from '@/lib/i18n/routing';
import {
  clubConfigSchema,
  type ClubConfigInput,
} from '@/lib/validation/admin-config';

// Locale endonyms — each language labelled in its own script.
// Same map the user-menu uses; consistency keeps the picker reading
// the same way wherever it appears.
const LOCALE_LABEL: Record<string, string> = {
  cs: 'Čeština',
  en: 'English',
};

// Spec 008 — ClubConfigForm.
//
// Renders the three club-row fields (name / currency / defaultLocale)
// with the v1.2 forms layer (react-hook-form + zodResolver). When the
// admin changes the currency code, a confirmation Dialog (FR-008)
// fires explaining that future amounts display in the new currency
// but existing entries stay denominated in the old — they confirm or
// cancel before the server action is invoked.
//
// Banking-profile editing lives in <BankingForm> alongside this one
// on /admin/config/page.tsx — composition, not duplication (the
// existing updateBankingProfileAction continues to handle bank fields).

interface ClubConfigFormProps {
  defaults: ClubConfigInput;
}

// Normalise the seed's "cs-CZ" / "en-US" form to the bare code the
// schema expects (and the field shows).
function normaliseLocale(raw: string): ClubConfigInput['defaultLocale'] {
  const base = raw.toLowerCase().split('-')[0] ?? '';
  return (routing.locales as readonly string[]).includes(base)
    ? (base as ClubConfigInput['defaultLocale'])
    : routing.defaultLocale;
}

export function ClubConfigForm({ defaults }: ClubConfigFormProps) {
  const t = useTranslations('admin.clubConfig');
  const [isPending, startTransition] = useTransition();
  const [pendingValues, setPendingValues] = useState<ClubConfigInput | null>(null);

  const initialValues: ClubConfigInput = {
    name: defaults.name,
    currencyCode: defaults.currencyCode,
    defaultLocale: normaliseLocale(defaults.defaultLocale),
  };

  const form = useForm<ClubConfigInput>({
    resolver: zodResolver(clubConfigSchema),
    defaultValues: initialValues,
  });

  function submitToServer(values: ClubConfigInput) {
    startTransition(async () => {
      const result = await updateClubConfigAction({
        name: values.name,
        currencyCode: values.currencyCode.toUpperCase(),
        defaultLocale: values.defaultLocale,
      });
      if (result.ok) {
        toast.success(t('saved'));
        form.reset(values);
      } else {
        toast.error(t('saveFailed'));
      }
    });
  }

  function onSubmit(values: ClubConfigInput) {
    const normalised: ClubConfigInput = {
      ...values,
      currencyCode: values.currencyCode.toUpperCase(),
    };
    if (normalised.currencyCode !== initialValues.currencyCode) {
      // Currency change → hold until the admin confirms.
      setPendingValues(normalised);
      return;
    }
    submitToServer(normalised);
  }

  function confirmCurrencyChange() {
    if (pendingValues) submitToServer(pendingValues);
    setPendingValues(null);
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('nameLabel')}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder={t('namePlaceholder')}
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
                  {/* DropdownMenu instead of a native select element
                      so we can put flag SVGs (which a native option
                      element does not support) next to the endonym
                      labels. Same pattern as the user-menu locale
                      switcher. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="border-input bg-background hover:bg-accent flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm"
                    >
                      <span className="inline-flex items-center gap-2">
                        <FlagIcon code={field.value} />
                        {LOCALE_LABEL[field.value] ?? field.value.toUpperCase()}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={4}
                      className="min-w-(--anchor-width)"
                    >
                      <DropdownMenuRadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        {routing.locales.map((locale) => (
                          <DropdownMenuRadioItem key={locale} value={locale}>
                            <FlagIcon code={locale} />
                            {LOCALE_LABEL[locale] ?? locale.toUpperCase()}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            {t('submit')}
          </Button>
        </form>
      </Form>

      <Dialog open={pendingValues !== null} onOpenChange={(open) => !open && setPendingValues(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('currencyChangeTitle')}</DialogTitle>
            <DialogDescription>
              {t('currencyChangeBody', {
                oldCurrency: initialValues.currencyCode,
                newCurrency: pendingValues?.currencyCode ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingValues(null)}
              disabled={isPending}
            >
              {t('currencyChangeCancel')}
            </Button>
            <Button type="button" onClick={confirmCurrencyChange} disabled={isPending}>
              {t('currencyChangeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
