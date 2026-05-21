import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ConfirmedList } from '@/components/treasurer/confirmed-list';
import { PendingList } from '@/components/treasurer/pending-list';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import {
  getPendingClaimsForTreasurer,
  getRecentlyConfirmedPayments,
} from '@/lib/db/queries/payments';
import { formatMoney } from '@/lib/format';

// US3 — treasurer's queue of payment claims awaiting confirmation.
export default async function PendingPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const t = await getTranslations('treasurer');
  const claims = await getPendingClaimsForTreasurer(ctx.club.id);
  const dateFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const view = claims.map((c) => ({
    paymentId: c.paymentId,
    memberDisplayName: c.memberDisplayName,
    amountDisplay: formatMoney(c.amountMinor, c.currencyCode, ctx.club.defaultLocale),
    variableSymbol: c.variableSymbol?.toString() ?? null,
    note: c.note,
    createdAtDisplay: dateFmt.format(c.createdAt),
  }));

  const confirmed = await getRecentlyConfirmedPayments(ctx.club.id);
  const confirmedView = confirmed.map((c) => ({
    paymentId: c.paymentId,
    memberDisplayName: c.memberDisplayName,
    amountDisplay: formatMoney(c.amountMinor, c.currencyCode, ctx.club.defaultLocale),
    confirmedAtDisplay: dateFmt.format(c.confirmedAt),
  }));

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('pendingTitle')}</h1>
        <Link href={'/admin/balances' as Route} className="text-primary text-sm underline">
          {t('allBalances')}
        </Link>
      </div>

      {view.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">{t('nothingPending')}</p>
        </Card>
      ) : (
        <PendingList claims={view} />
      )}

      <ConfirmedList payments={confirmedView} />
    </main>
  );
}
