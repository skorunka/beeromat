import type { Route } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { getAllMemberBalances } from '@/lib/db/queries/payments';
import { formatMoney } from '@/lib/format';

// US3 — treasurer's all-members balance overview, biggest debtors first.
export default async function BalancesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const balances = await getAllMemberBalances(ctx.club.id);
  const { currencyCode, defaultLocale } = ctx.club;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Member balances</h1>
        <Link href={'/admin/pending' as Route} className="text-primary text-sm underline">
          Pending payments
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {balances.map((b) => (
          <li key={b.memberId}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {b.displayName}
                  {b.isActive ? null : (
                    <Badge variant="outline" className="ml-2">
                      inactive
                    </Badge>
                  )}
                </div>
                {b.pendingConfirmationMinor > 0n ? (
                  <div className="text-muted-foreground text-xs">
                    {formatMoney(b.pendingConfirmationMinor, currencyCode, defaultLocale)} pending
                    confirmation
                  </div>
                ) : null}
              </div>
              <div
                className={`font-mono text-sm font-semibold ${
                  b.balanceMinor > 0n ? '' : 'text-muted-foreground'
                }`}
              >
                {formatMoney(b.balanceMinor, currencyCode, defaultLocale)}
              </div>
            </Card>
          </li>
        ))}
        {balances.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center text-sm">No members yet.</li>
        ) : null}
      </ul>
    </main>
  );
}
