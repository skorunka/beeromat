import { setRequestLocale } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/nav/language-switcher';
import { SignInForm } from './SignInForm';

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <SignInForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''} />
    </div>
  );
}
