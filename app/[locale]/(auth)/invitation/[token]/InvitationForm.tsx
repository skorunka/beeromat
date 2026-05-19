'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInvitationAction } from '@/lib/auth/actions';

interface InvitationFormProps {
  token: string;
}

export function InvitationForm({ token }: InvitationFormProps) {
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
        setError(
          'This invitation link is no longer valid. Ask your club admin to send a new one.',
        );
      } else if (result.code === 'DISPLAY_NAME_REQUIRED') {
        setError('Please enter your display name.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  if (accepted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">You&apos;re in!</h1>
        <p className="text-muted-foreground">
          We&apos;ve sent a sign-in link to <strong>{accepted.email}</strong>. Open it on this
          device to finish setup.
        </p>
        <p className="text-muted-foreground text-sm">The link expires in 5 minutes.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Welcome to beeromat</h1>
      <p className="text-muted-foreground text-center text-sm">
        Set your display name to finish the invitation. We&apos;ll then email you a one-time
        sign-in link.
      </p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
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
          {isPending ? 'Working…' : 'Accept invitation'}
        </Button>
      </form>
    </main>
  );
}
