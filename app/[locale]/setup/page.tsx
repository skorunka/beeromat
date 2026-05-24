import { setRequestLocale } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/nav/language-switcher';
import { SetupWizardForm } from './SetupWizardForm';

// Spec 009 — /setup page.
//
// Server-component shell. Identical layout pattern to /sign-in: a
// LanguageSwitcher pinned to the top-right (so the wizard's locale
// can be flipped before submitting — see US4) over the wizard form
// which manages its own <main> wrapper.
//
// Reachability is enforced by proxy.ts:
//   - true-fresh state → all requests redirected here (FR-011)
//   - bootstrapped state → all requests for this path redirected
//     elsewhere (FR-010); page is never rendered.
// So we don't re-check state here; the action's in-transaction
// recheck (FR-012) is the security boundary.

export default async function SetupPage({
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
      <SetupWizardForm />
    </div>
  );
}
