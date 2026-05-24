'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { auth, withBootstrapLocale } from '@/lib/auth/better-auth';
import { createClubAndAdminUserTx } from '@/lib/auth/bootstrap';
import { invalidateFreshDeploymentCache } from '@/lib/db/queries/bootstrap-state';
import { setLocaleCookie } from '@/lib/i18n/actions';
import type { Locale } from '@/lib/i18n/routing';
import { onboardingSchema } from '@/lib/validation/onboarding';

// Spec 009 contracts/onboarding.md §1 — bootstrapClubAction.
//
// The wizard's submit. Transitions deployment state X → state A.
// Spec 008's session.create.after hook handles the A → B promotion
// when the user later clicks the magic link.
//
// RBAC is by construction, not by check: the only state in which
// this action can succeed is state X, and in state X no member
// exists yet. The transactional state recheck inside
// createClubAndAdminUserTx (FR-012) IS the access control.

export type BootstrapClubResult =
  | { ok: true; code: 'OK' }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'BOOTSTRAP_ALREADY_COMPLETE' };

export async function bootstrapClubAction(
  rawInput: unknown,
): Promise<BootstrapClubResult> {
  const parsed = onboardingSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: 'VALIDATION_FAILED', fieldErrors };
  }
  const input = parsed.data;

  const result = await createClubAndAdminUserTx(input);
  if (result.kind === 'already-complete') {
    return { ok: false, code: 'BOOTSTRAP_ALREADY_COMPLETE' };
  }

  // Post-commit side effects. Order matters:
  //   1. invalidate the fresh-state cache so the proxy stops sending
  //      visitors to /setup immediately, even within this same process.
  //   2. set NEXT_LOCALE so the existing sendMagicLink callback's
  //      getLocale() returns the chosen defaultLocale (research.md §3).
  //   3. dispatch the magic link via Better Auth — rate-limit and
  //      Turnstile parity inherited from the existing wiring.
  //   4. revalidate the layout so cached RSC trees see the new state.
  invalidateFreshDeploymentCache();
  await setLocaleCookie(input.defaultLocale);
  try {
    // withBootstrapLocale wraps the signInMagicLink call so the
    // sendMagicLink callback uses the chosen club default locale,
    // not the URL prefix locale — see lib/auth/better-auth.ts.
    const requestHeaders = await headers();
    await withBootstrapLocale(input.defaultLocale as Locale, () =>
      auth.api.signInMagicLink({
        body: { email: input.adminEmail },
        headers: requestHeaders,
      }),
    );
  } catch (err) {
    // Send-best-effort: the user + clubs rows are committed. If
    // dispatch fails (SMTP down), the user can re-request via
    // /sign-in and spec 008's promotion hook still fires when they
    // click the eventual link.
    console.error('[bootstrap] magic-link dispatch failed', err);
  }
  revalidatePath('/', 'layout');

  return { ok: true, code: 'OK' };
}
