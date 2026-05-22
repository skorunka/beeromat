import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { PaymentHistoryRow, PaymentHistoryStatus } from '@/lib/db/queries/payments';

// Renders a member's own payment timeline (v1.3 — UX review F20). A
// pure presentational Server Component: no interactivity, no client
// state, so `amountMinor` (bigint) is rendered server-side without
// crossing a client boundary.

const STATUS_KEY: Record<PaymentHistoryStatus, string> = {
  claimed: 'statusPending',
  confirmed: 'statusConfirmed',
  disputed: 'statusDisputed',
  voided: 'statusVoided',
};

const STATUS_VARIANT: Record<PaymentHistoryStatus, 'secondary' | 'destructive' | 'outline'> = {
  claimed: 'outline',
  confirmed: 'secondary',
  disputed: 'destructive',
  voided: 'outline',
};

export async function PaymentHistoryList({
  rows,
  currencyCode,
  locale,
}: {
  rows: PaymentHistoryRow[];
  currencyCode: string;
  locale: string;
}) {
  const t = await getTranslations('payments');
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);

  if (rows.length === 0) {
    return <p className="text-muted-foreground p-6 text-center text-sm">{t('empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.paymentId}>
          <Card className="flex flex-col gap-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {formatMoney(row.amountMinor, currencyCode, locale)}
              </span>
              <Badge variant={STATUS_VARIANT[row.status]}>{t(STATUS_KEY[row.status])}</Badge>
            </div>
            <div className="text-muted-foreground text-xs">
              {row.status === 'confirmed' && row.resolvedAt
                ? t('confirmedOn', { date: fmtDate(row.resolvedAt) })
                : row.status === 'disputed' && row.resolvedAt
                  ? t('disputedOn', { date: fmtDate(row.resolvedAt) })
                  : row.status === 'voided' && row.resolvedAt
                    ? t('voidedOn', { date: fmtDate(row.resolvedAt) })
                    : t('loggedOn', { date: fmtDate(row.createdAt) })}
            </div>
            {row.origin === 'treasurer_initiated' ? (
              <div className="text-muted-foreground text-xs">{t('treasurerRecorded')}</div>
            ) : null}
            {row.disputeReason ? (
              <p className="text-destructive text-xs">{row.disputeReason}</p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
