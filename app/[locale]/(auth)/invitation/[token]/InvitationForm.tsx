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
  FormRootError,
} from '@/components/ui/form';
import { acceptInvitationAction } from '@/lib/auth/actions';
import {
  acceptInvitationSchema,
  type AcceptInvitationValues,
} from '@/lib/validation/invitation';

interface InvitationFormProps {
  token: string;
}

export function InvitationForm({ token }: InvitationFormProps) {
  const t = useTranslations('invitation');
  const [accepted, setAccepted] = useState<{ email: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<AcceptInvitationValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { displayName: '' },
  });

  function onSubmit(values: AcceptInvitationValues) {
    startTransition(async () => {
      const result = await acceptInvitationAction({
        token,
        displayName: values.displayName,
      });
      if (result.ok) {
        setAccepted({ email: result.data?.email ?? '' });
      } else if (result.code === 'DISPLAY_NAME_REQUIRED') {
        form.setError('displayName', { message: 'invitation.errorNameRequired' });
      } else if (result.code === 'INVALID_INVITATION') {
        form.setError('root', { message: 'invitation.errorInvalid' });
      } else {
        form.setError('root', { message: 'invitation.errorGeneric' });
      }
    });
  }

  if (accepted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">{t('acceptedTitle')}</h1>
        <p className="text-muted-foreground">
          {t('acceptedBody', { email: accepted.email })}
        </p>
        <p className="text-muted-foreground text-sm">{t('acceptedNote')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">{t('welcomeTitle')}</h1>
      </div>
      <p className="text-muted-foreground text-center text-sm">{t('welcomeBody')}</p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex w-full flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('displayNameLabel')}</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormRootError />

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="h-14 text-lg"
          >
            {isPending ? t('working') : t('submit')}
          </Button>
        </form>
      </Form>
    </main>
  );
}
