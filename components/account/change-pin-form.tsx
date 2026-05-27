'use client';

import { useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

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
import { setPinAction } from '@/lib/auth/actions';
import { pinChangeSchema, type PinChangeValues } from '@/lib/validation/auth';

// Spec 010 stub closure — the "later" badge on the PIN row is gone.
// Inline change-PIN form (current → new → confirm) that calls
// setPinAction with the `currentPin` arg the action already supports.
// Wrong current PIN surfaces as a form-level error, not a toast — same
// pattern as the unlock screen.

const PIN_LENGTH = 4;

export function ChangePinForm() {
  const t = useTranslations('account.changePin');
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<PinChangeValues>({
    resolver: zodResolver(pinChangeSchema) as unknown as Resolver<PinChangeValues>,
    defaultValues: { currentPin: '', pin: '', confirmPin: '' },
  });

  function onSubmit(values: PinChangeValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await setPinAction({
        pin: values.pin,
        currentPin: values.currentPin,
      });
      if (result.ok) {
        toast.success(t('saved'));
        form.reset({ currentPin: '', pin: '', confirmPin: '' });
        setOpen(false);
        return;
      }
      if (result.code === 'WRONG_CURRENT_PIN') {
        setServerError(t('wrongCurrent'));
        form.resetField('currentPin');
        return;
      }
      if (result.code === 'CURRENT_PIN_REQUIRED') {
        setServerError(t('currentRequired'));
        return;
      }
      setServerError(t('saveFailed'));
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {t('cta')}
      </Button>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="mt-3 flex w-full flex-col gap-3"
      >
        <FormField
          control={form.control}
          name="currentPin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('currentLabel')}</FormLabel>
              <FormControl>
                <PinInput
                  length={PIN_LENGTH}
                  autoFocus
                  autoComplete="current-password"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  ariaLabel={t('currentLabel')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="pin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('newLabel')}</FormLabel>
              <FormControl>
                <PinInput
                  length={PIN_LENGTH}
                  autoComplete="new-password"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  ariaLabel={t('newLabel')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('confirmLabel')}</FormLabel>
              <FormControl>
                <PinInput
                  length={PIN_LENGTH}
                  autoComplete="new-password"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  ariaLabel={t('confirmLabel')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError ? (
          <p role="alert" className="text-destructive text-sm">
            {serverError}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="submit"
            size="default"
            disabled={isPending}
            isPending={isPending}
            className="flex-1"
          >
            {t('submit')}
          </Button>
          <Button
            type="button"
            size="default"
            variant="ghost"
            onClick={() => {
              form.reset({ currentPin: '', pin: '', confirmPin: '' });
              setServerError(null);
              setOpen(false);
            }}
            disabled={isPending}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
