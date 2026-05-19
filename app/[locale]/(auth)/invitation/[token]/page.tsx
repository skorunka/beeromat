import { setRequestLocale } from 'next-intl/server';

import { InvitationForm } from './InvitationForm';

// The invitation landing page receives the raw token in the URL.
// Token validation is performed inside acceptInvitationAction (we don't
// pre-validate here because argon2-verifying against the hash is itself
// the validation; pre-validating would duplicate the work).
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return <InvitationForm token={token} />;
}
