import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { setRequestLocale } from 'next-intl/server';

import { ManualPaymentForm } from '@/components/treasurer/manual-payment-form';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { memberBalance, paymentsTotal } from '@/lib/balance/calculate';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { formatMoney } from '@/lib/format';

// US4 — per-member balance detail + the treasurer's manual-payment form.
export default async function MemberBalanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const member = await db.query.members.findFirst({
    where: and(eq(members.id, memberId), eq(members.clubId, ctx.club.id)),
  });
  if (!member) notFound();

  const [balanceMinor, pendingMinor] = await Promise.all([
    memberBalance(member.id),
    paymentsTotal(member.id, 'claimed'),
  ]);
  const { currencyCode, defaultLocale } = ctx.club;

  return (
    <main className="mx-auto max-w-md p-4">
      <Link href={'/admin/balances' as Route} className="text-primary text-sm underline">
        ← All balances
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">{member.displayName}</h1>

      <Card className="mb-6 p-6">
        <div className="text-muted-foreground text-sm">Outstanding balance</div>
        <div className="mt-1 text-3xl font-bold">
          {formatMoney(balanceMinor, currencyCode, defaultLocale)}
        </div>
        {pendingMinor > 0n ? (
          <div className="text-muted-foreground mt-1 text-sm">
            {formatMoney(pendingMinor, currencyCode, defaultLocale)} pending confirmation
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">Record a payment</h2>
        <ManualPaymentForm memberId={member.id} currencyCode={currencyCode} />
      </Card>
    </main>
  );
}
