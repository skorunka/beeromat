import type { Route } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { TransferList, type BetTransferView, type TransferableView } from '@/components/bet/transfer-list';
import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import {
  getBetTransfersForSession,
  getTransferableConsumptionsForCurrentSession,
} from '@/lib/db/queries/bets';
import { roleSatisfies } from '@/lib/permissions';
import { formatMoney } from '@/lib/format';

// US6 — bet transfers: take a winner's drink onto your own tab.
export default async function BetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const { currencyCode, defaultLocale } = ctx.club;

  const { session, consumptions } = await getTransferableConsumptionsForCurrentSession({
    clubId: ctx.club.id,
    memberId: ctx.member.id,
  });

  if (!session) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-4 text-xl font-semibold">Settle a bet</h1>
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">No open session — bets settle within a session.</p>
          <Link href={'/' as Route} className="text-primary mt-4 inline-block text-sm underline">
            Back home
          </Link>
        </Card>
      </main>
    );
  }

  const transferRows = await getBetTransfersForSession({
    sessionId: session.id,
    memberId: ctx.member.id,
  });
  const isTreasurer = roleSatisfies(ctx.member.role, 'treasurer');

  const transferables: TransferableView[] = consumptions.map((c) => ({
    consumptionId: c.consumptionId,
    label: `${c.beerTypeName} · ${c.ownerDisplayName}`,
    amountDisplay: formatMoney(c.unitPriceMinor, currencyCode, defaultLocale),
  }));

  const transfers: BetTransferView[] = transferRows.map((t) => {
    const tookByMe = t.toMemberId === ctx.member.id;
    return {
      id: t.id,
      description: tookByMe
        ? `You took ${t.fromMemberName}'s ${t.beerTypeName}`
        : `${t.toMemberName} took your ${t.beerTypeName}`,
      amountDisplay: formatMoney(t.unitPriceMinorSnapshot, currencyCode, defaultLocale),
      voided: t.voided,
      canVoid: !t.voided && (t.createdByUserId === ctx.user.id || isTreasurer),
    };
  });

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Settle a bet</h1>
        <p className="text-muted-foreground text-sm">
          Lost a bet? Take the winner&apos;s drink onto your tab.
        </p>
      </header>

      <TransferList transferables={transferables} transfers={transfers} />
    </main>
  );
}
