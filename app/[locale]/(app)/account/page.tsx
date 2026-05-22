import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';

// The member account hub (v1.3 — UX review F14/F15/F20). Reached by
// tapping the home-screen greeting. Holds the things that are "about
// me": the member's name, a link to their payment history (US1), and
// the sign-out control (US4).
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('account');

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{ctx.member.displayName}</p>

      <Card className="mt-6 flex flex-col divide-y p-0">
        {/* US1 adds the payment-history link and US4 the sign-out control. */}
      </Card>
    </main>
  );
}
