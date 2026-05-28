import type { Route } from 'next';
import { and, eq, ne, sql } from 'drizzle-orm';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import { MatchBetModule } from '@/components/home/match-bet-module';
import { OpenMatchPrompt } from '@/components/home/open-match-prompt';
import { OnBehalfReviewBanner } from '@/components/home/on-behalf-review-banner';
import { LogForOtherLink } from '@/components/log/log-for-other-link';
import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { lastBeerForMember } from '@/lib/db/queries/consumption';
import { listOpenAgreements } from '@/lib/db/queries/match-agreements';
import { matchBetSummaryForMember, wonBeerSummaryForMember } from '@/lib/db/queries/match-bet-summary';
import { joinSideNames } from '@/lib/format/match-sides';
import { onBehalfReviewSummaryForMember } from '@/lib/db/queries/on-behalf-review';
import { formatMoney } from '@/lib/format';
import { members } from '@/lib/db/schema/members';

// Spec 017 — home as the single action surface for the daily core
// loop. Primary CTA = one-tap log of the member's last beer. Balance
// rendered as a friendly sentence (no nag tone). Settle CTA stays
// secondary, visible only when owing.
export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('home');
  const [
    balanceMinor,
    lastBeer,
    catalog,
    betSummary,
    wonSummary,
    openAgreements,
    otherMembersCountResult,
    onBehalfSummary,
  ] = await Promise.all([
    memberBalance(ctx.member.id),
    lastBeerForMember(ctx.member.id, ctx.club.id),
    getBeerTypeCatalog(ctx.club.id),
    matchBetSummaryForMember(ctx.member.id, ctx.club.id),
    wonBeerSummaryForMember(ctx.member.id, ctx.club.id),
    listOpenAgreements(ctx.club.id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(members)
      .where(
        and(
          eq(members.clubId, ctx.club.id),
          eq(members.isActive, true),
          ne(members.id, ctx.member.id),
        ),
      ),
    onBehalfReviewSummaryForMember(ctx.member.id, ctx.club.id),
  ]);

  // Open matches the member is actually a participant in — the home
  // prompt nudges them to record the result. A treasurer's home isn't
  // cluttered with every club match they're not playing in.
  const myOpenMatches = openAgreements
    .filter((a) =>
      [...a.sides.A, ...a.sides.B].some((s) => s.memberId === ctx.member.id),
    )
    .map((a) => ({
      id: a.id,
      sideA: joinSideNames(a.sides.A),
      sideB: joinSideNames(a.sides.B),
    }));
  // The one-tap-log dropdown only lists in-stock, non-archived beers.
  const inStockCatalog = catalog
    .filter((b) => !b.isArchived && !b.isOutOfStock)
    .map((b) => ({
      id: b.id,
      name: b.name,
      currentStock: b.currentStock,
      isArchived: b.isArchived,
      unitPriceMinor: b.unitPriceMinor,
    }));
  const hasOtherMembers = (otherMembersCountResult[0]?.n ?? 0) > 0;
  const owes = balanceMinor > 0n;
  const balanceFormatted = formatMoney(
    balanceMinor,
    ctx.club.currencyCode,
    ctx.club.defaultLocale,
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex flex-col gap-1">
        <Link
          href="/account"
          className="text-foreground hover:text-primary inline-flex min-h-11 items-center text-base font-medium transition-colors"
        >
          {t('greeting', { name: ctx.member.displayName })}
        </Link>
        <p
          className={
            owes
              ? 'text-primary text-xl font-bold tabular-nums leading-relaxed'
              : 'text-foreground text-xl font-medium leading-relaxed'
          }
        >
          {owes ? t('balanceOwed', { amount: balanceFormatted }) : t('balanceSquare')}
        </p>
      </header>

      <OnBehalfReviewBanner
        rows={onBehalfSummary.rows.map((r) => ({
          consumptionId: r.consumptionId,
          loggerDisplayName: r.loggerDisplayName,
          loggerMemberId: r.loggerMemberId,
          loggerAvatarKey: r.loggerAvatarKey,
          loggerAvatarUploadAt: r.loggerAvatarUploadAt,
          beerName: r.beerName,
        }))}
      />

      <OpenMatchPrompt matches={myOpenMatches} />

      <MatchBetModule
        betCount={betSummary.betCount}
        sourceMatchIds={betSummary.sourceMatchIds}
        wonCount={wonSummary.wonCount}
        wonMatchIds={wonSummary.sourceMatchIds}
      />

      <HomeOneTapLog
        beer={lastBeer}
        catalog={inStockCatalog}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
      />

      <LogForOtherLink hasOtherMembers={hasOtherMembers} />

      {owes ? (
        <Link
          href={'/settle' as Route}
          className={buttonVariants({ variant: 'outline', size: 'default', className: 'self-center' })}
        >
          {t('settleCta')}
        </Link>
      ) : null}
    </main>
  );
}
