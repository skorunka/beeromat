'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInvitationAction } from '@/lib/auth/actions';

interface InvitationFormProps {
  token: string;
}

export function InvitationForm({ token }: InvitationFormProps) {
  const t = useTranslations('invitation');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ email: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction({ token, displayName });
      if (result.ok) {
        setAccepted({ email: result.data?.email ?? '' });
      } else if (result.code === 'INVALID_INVITATION') {
        setError(t('errorInvalid'));
      } else if (result.code === 'DISPLAY_NAME_REQUIRED') {
        setError(t('errorNameRequired'));
      } else {
        setError(t('errorGeneric'));
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
      <h1 className="text-2xl font-bold">{t('welcomeTitle')}</h1>
      <p className="text-muted-foreground text-center text-sm">{t('welcomeBody')}</p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">{t('displayNameLabel')}</Label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
            maxLength={100}
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          size="lg"
          disabled={!displayName || isPending}
          className="h-14 text-lg"
        >
          {isPending ? t('working') : t('submit')}
        </Button>
      </form>
    </main>
  );
}
