import { and, eq, notExists, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { CloseRoundButton } from '@/components/match/close-round-button';
import { TransferList, type BetTransferView, type TransferableView } from '@/components/bet/transfer-list';
import { db } from '@/lib/db/client';
import {
  getBetTransfersForSession,
  getTransferableConsumptionsForCurrentSession,
} from '@/lib/db/queries/bets';
import { consumptionVoids, consumptions as consumptionsTable } from '@/lib/db/schema/consumption';
import { roleSatisfies, type Role } from '@/lib/permissions';
import { formatMoney } from '@/lib/format';

// Casual "settle a bet" — take a winner's drink onto your own tab,
// for an informal bet with no scheduled match. Folded into the Match
// hub (2026-05-28) so there is a single place for everything
// bet/match-related; the standalone /bet page + nav tab were retired.
//
// Server component: does the same data fetch the old /bet page did,
// minus the page shell, and renders inside a <section> on /match.

interface BetSettleSectionProps {
  clubId: string;
  memberId: string;
  userId: string;
  role: Role;
  currencyCode: string;
  locale: string;
}

export async function BetSettleSection({
  clubId,
  memberId,
  userId,
  role,
  currencyCode,
  locale,
}: BetSettleSectionProps) {
  const t = await getTranslations('bet');

  const { session, consumptions } = await getTransferableConsumptionsForCurrentSession({
    clubId,
    memberId,
  });

  // No open round → nothing to settle here. Hide the section entirely
  // rather than show a kolo-explainer empty state with a "go log a
  // beer" link — Match is for match/bet work, not for nudging into
  // the log flow.
  if (!session) return null;

  const transferRows = await getBetTransfersForSession({ sessionId: session.id, memberId });
  const isTreasurer = roleSatisfies(role, 'treasurer');

  // Round context so closing the round is an informed action (the
  // persona panel flagged "closing is blind"): non-voided drinks
  // logged in the open round.
  const [drinkCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(consumptionsTable)
    .where(
      and(
        eq(consumptionsTable.drinkSessionId, session.id),
        notExists(
          db
            .select()
            .from(consumptionVoids)
            .where(eq(consumptionVoids.consumptionId, consumptionsTable.id)),
        ),
      ),
    );
  const roundDrinkCount = drinkCountRow?.n ?? 0;
  const roundStarted = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(session.startedAt);

  const transferables: TransferableView[] = consumptions.map((c) => ({
    consumptionId: c.consumptionId,
    beerTypeName: c.beerTypeName,
    ownerMemberId: c.ownerMemberId,
    ownerDisplayName: c.ownerDisplayName,
    ownerAvatarKey: c.ownerAvatarKey,
    ownerAvatarUploadAt: c.ownerAvatarUploadAt,
    amountDisplay: formatMoney(c.unitPriceMinor, currencyCode, locale),
  }));

  // Running tally of drinks the member has taken from bets this round.
  const myTaken = transferRows.filter((tr) => tr.toMemberId === memberId && !tr.voided);
  const betTally =
    myTaken.length > 0
      ? {
          count: myTaken.length,
          totalDisplay: formatMoney(
            myTaken.reduce((sum, tr) => sum + tr.unitPriceMinorSnapshot, 0n),
            currencyCode,
            locale,
          ),
        }
      : null;

  const transfers: BetTransferView[] = transferRows.map((tr) => {
    const tookByMe = tr.toMemberId === memberId;
    const counterparty = tookByMe
      ? {
          id: tr.fromMemberId,
          displayName: tr.fromMemberName,
          avatarKey: tr.fromAvatarKey,
          avatarUploadAt: tr.fromAvatarUploadAt,
        }
      : {
          id: tr.toMemberId,
          displayName: tr.toMemberName,
          avatarKey: tr.toAvatarKey,
          avatarUploadAt: tr.toAvatarUploadAt,
        };
    return {
      id: tr.id,
      description: tookByMe
        ? t('youTook', { name: tr.fromMemberName, beer: tr.beerTypeName })
        : t('tookYours', { name: tr.toMemberName, beer: tr.beerTypeName }),
      counterpartyMemberId: counterparty.id,
      counterpartyDisplayName: counterparty.displayName,
      counterpartyAvatarKey: counterparty.avatarKey,
      counterpartyAvatarUploadAt: counterparty.avatarUploadAt,
      amountDisplay: formatMoney(tr.unitPriceMinorSnapshot, currencyCode, locale),
      voided: tr.voided,
      canVoid: !tr.voided && (tr.createdByUserId === userId || isTreasurer),
    };
  });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('title')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('roundContext', { started: roundStarted, count: roundDrinkCount })}
      </p>
      <TransferList transferables={transferables} transfers={transfers} tally={betTally} />
      <CloseRoundButton drinkCount={roundDrinkCount} />
    </section>
  );
}
