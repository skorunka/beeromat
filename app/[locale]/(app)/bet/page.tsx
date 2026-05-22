import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { TransferList, type BetTransferView, type TransferableView } from '@/components/bet/transfer-list';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
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
  const t = await getTranslations('bet');
  const { currencyCode, defaultLocale } = ctx.club;

  const { session, consumptions } = await getTransferableConsumptionsForCurrentSession({
    clubId: ctx.club.id,
    memberId: ctx.member.id,
  });

  if (!session) {
    // No open session: a member cannot open one directly — the first
    // logged beer opens it — so guide them to the log screen (US6).
    return (
      <main className="mx-auto max-w-md p-5">
        <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
        <Card className="p-6 text-center">
          <p className="text-lg font-medium">{t('noSessionTitle')}</p>
          <p className="text-muted-foreground mt-2 text-sm">{t('noSessionBody')}</p>
          <Link
            href="/log"
            className={buttonVariants({ className: 'mt-4 h-12 w-full' })}
          >
            {t('logToStart')}
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

  // A running tally of the drinks this member has taken onto their tab
  // from bets this session (v1.3 UX review F12) — distinct from the
  // home-screen balance figure.
  const myTaken = transferRows.filter(
    (tr) => tr.toMemberId === ctx.member.id && !tr.voided,
  );
  const betTally =
    myTaken.length > 0
      ? {
          count: myTaken.length,
          totalDisplay: formatMoney(
            myTaken.reduce((sum, tr) => sum + tr.unitPriceMinorSnapshot, 0n),
            currencyCode,
            defaultLocale,
          ),
        }
      : null;

  const transfers: BetTransferView[] = transferRows.map((tr) => {
    const tookByMe = tr.toMemberId === ctx.member.id;
    return {
      id: tr.id,
      description: tookByMe
        ? t('youTook', { name: tr.fromMemberName, beer: tr.beerTypeName })
        : t('tookYours', { name: tr.toMemberName, beer: tr.beerTypeName }),
      amountDisplay: formatMoney(tr.unitPriceMinorSnapshot, currencyCode, defaultLocale),
      voided: tr.voided,
      canVoid: !tr.voided && (tr.createdByUserId === ctx.user.id || isTreasurer),
    };
  });

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </header>

      <TransferList transferables={transferables} transfers={transfers} tally={betTally} />
    </main>
  );
}
