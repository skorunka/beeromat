'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  /** Called with the token when Turnstile resolves successfully. */
  onSuccess?: (token: string) => void;
  /** Called with the error code when verification fails. */
  onError?: (errorCode: string) => void;
  /** Called when the token expires (5 minutes after issuance). */
  onExpire?: () => void;
  /** Visual mode: 'managed' (default), 'invisible', 'non-interactive'. */
  appearance?: 'always' | 'interaction-only' | 'execute';
}

/**
 * Thin wrapper around `@marsidev/react-turnstile` configured with our
 * project defaults. The site key is passed in (not read from env here)
 * so the consumer page can read `NEXT_PUBLIC_TURNSTILE_SITE_KEY` once
 * via Server Component props and pass it down — avoiding a second env
 * read on every render.
 */
export function TurnstileWidget({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  appearance = 'interaction-only',
}: TurnstileWidgetProps) {
  const ref = useRef<TurnstileInstance | null>(null);
  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      options={{
        appearance,
        theme: 'auto',
      }}
      onSuccess={onSuccess}
      onError={(err) => onError?.(String(err))}
      onExpire={onExpire}
    />
  );
}
