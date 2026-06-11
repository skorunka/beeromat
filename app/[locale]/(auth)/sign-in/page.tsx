import { setRequestLocale } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/nav/language-switcher';
import { SignInForm } from './SignInForm';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // A failed magic-link verify (expired / already-used / invalid) is
  // redirected here by Better Auth with ?error=<CODE> appended (see
  // errorCallbackURL in requestMagicLinkAction). Surface a gentle
  // "request a fresh one" banner rather than dumping the user on a
  // bare form with no explanation.
  const { error } = await searchParams;
  const linkFailed = error === 'EXPIRED_TOKEN' || error === 'INVALID_TOKEN';
  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <SignInForm
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        linkFailed={linkFailed}
      />
    </div>
  );
}
