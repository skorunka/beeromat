import 'server-only';

import { env } from '@/lib/env';

interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Server-side verification of a Turnstile token. Returns `true` only if
 * Cloudflare confirms the token is valid for our secret key. On any
 * failure path (network error, missing token, expired, replay) returns
 * `false`. Specific error codes are logged but NEVER returned to the
 * caller — the UI should respond with a single generic message to avoid
 * information disclosure.
 *
 * Token lifetime is 5 minutes (Cloudflare-imposed); tokens are
 * single-use.
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) {
      console.warn('[turnstile] siteverify non-200:', res.status, await res.text());
      return false;
    }
    const data = (await res.json()) as TurnstileResponse;
    if (!data.success) {
      console.warn('[turnstile] verification failed:', data['error-codes']);
    }
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] siteverify request error:', err);
    return false;
  }
}
