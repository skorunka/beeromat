import type { Route } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { PaymentHistoryList } from '@/components/payments/payment-history-list';
import { requireUnlocked } from '@/lib/auth/session';
import { getPaymentHistory } from '@/lib/db/queries/payments';

// The member payment-history screen (v1.3 — UX review F20). A member's
// own timeline of every payment they have made, including confirmed
// ones — the post-confirmation visibility the Settle screen lacked.
export default async function PaymentHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('payments');
  const tAccount = await getTranslations('account');
  const rows = await getPaymentHistory(ctx.member.id, ctx.club.id);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href={'/account' as Route}
          className="text-primary shrink-0 text-sm underline"
        >
          ← {tAccount('title')}
        </Link>
      </header>
      <PaymentHistoryList
        rows={rows}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
      />
    </main>
  );
}
