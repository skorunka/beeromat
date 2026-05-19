'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { requestMagicLinkAction } from '@/lib/auth/actions';

interface SignInFormProps {
  turnstileSiteKey: string;
}

export function SignInForm({ turnstileSiteKey }: SignInFormProps) {
  const t = useTranslations('auth.signIn');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) return;
    startTransition(async () => {
      await requestMagicLinkAction({ email, turnstileToken });
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

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        {turnstileSiteKey ? (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onSuccess={(token) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />
        ) : (
          <p className="text-destructive text-sm">Turnstile site key missing</p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={!email || !turnstileToken || isPending}
          className="h-14 text-lg"
        >
          {t('submit')}
        </Button>

        <p className="text-muted-foreground text-xs">{t('checkInbox')}</p>
      </form>
    </main>
  );
}
