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
import { acceptInvitationAction, resendInvitationLinkAction } from '@/lib/auth/actions';
import {
  acceptInvitationSchema,
  type AcceptInvitationValues,
} from '@/lib/validation/invitation';

interface InvitationFormProps {
  token: string;
}

export function InvitationForm({ token }: InvitationFormProps) {
  const t = useTranslations('invitation');
  // Three terminal screens layered over the name form:
  //  - accepted: invitation consumed, sign-in link sent
  //  - expired: token no longer valid → offer a self-service resend
  //  - resent: a fresh invitation email was just dispatched
  const [accepted, setAccepted] = useState<{ email: string } | null>(null);
  const [expired, setExpired] = useState(false);
  const [resent, setResent] = useState<{ email: string } | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();

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
        // Swap the dead form out for a dedicated expired screen with a
        // resend button, rather than a leftover name field + red text.
        setExpired(true);
      } else {
        form.setError('root', { message: 'invitation.errorGeneric' });
      }
    });
  }

  function handleResend() {
    setResendError(null);
    startResendTransition(async () => {
      const result = await resendInvitationLinkAction({ token });
      if (result.ok) {
        setResent({ email: result.data?.email ?? '' });
      } else if (result.code === 'RATE_LIMITED') {
        setResendError(t('resendRateLimited'));
      } else if (result.code === 'INVALID_INVITATION') {
        // No pending invitation matches this token — it was never just
        // "expired", it's gone (consumed, revoked, or the row no longer
        // exists). Retrying can't fix that, so point them at the admin
        // instead of the transient "try again" copy.
        setResendError(t('errorInvalid'));
      } else {
        setResendError(t('resendFailed'));
      }
    });
  }

  // accepted and resent share the same "we emailed a link to X" shape —
  // only the heading differs.
  const linkSent = accepted ?? resent;
  if (linkSent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">
          {t(accepted ? 'acceptedTitle' : 'resentTitle')}
        </h1>
        <div className="flex flex-col items-center gap-2">
          <p className="text-muted-foreground">{t('acceptedBodyPrefix')}</p>
          <p className="text-primary text-lg font-semibold break-all">
            {linkSent.email}
          </p>
          <p className="text-muted-foreground">{t('acceptedBodySuffix')}</p>
        </div>
        <p className="text-muted-foreground text-sm">{t('acceptedNote')}</p>
      </main>
    );
  }

  if (expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">{t('expiredTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('expiredBody')}</p>
        {resendError ? (
          <p role="alert" className="text-destructive text-sm">
            {resendError}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          onClick={handleResend}
          disabled={isResending}
          isPending={isResending}
          className="h-14 w-full text-lg"
        >
          {isResending ? t('resending') : t('resend')}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold">{t('welcomeTitle')}</h1>
      </div>

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

          {/* One-line heads-up about what tapping submit does. */}
          <p className="text-muted-foreground text-center text-sm">
            {t('submitHint')}
          </p>

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            isPending={isPending}
            className="h-14 text-lg"
          >
            {isPending ? t('working') : t('submit')}
          </Button>
        </form>
      </Form>
    </main>
  );
}
