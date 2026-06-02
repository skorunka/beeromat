import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { roleSatisfies } from '@/lib/permissions';
import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import { MatchBetModule } from '@/components/home/match-bet-module';
import { OpenMatchPrompt } from '@/components/home/open-match-prompt';
import { OnBehalfReviewBanner } from '@/components/home/on-behalf-review-banner';
import { TabBeerBreakdown } from '@/components/tab/tab-beer-breakdown';
import { HomeLogForOther } from '@/components/home/home-log-for-other';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { getMyTabForSession, lastBeerForMember } from '@/lib/db/queries/consumption';
import { listOtherActiveMembers } from '@/lib/db/queries/members';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { listOpenAgreementsForMember } from '@/lib/db/queries/match-agreements';
import { matchBetSummaryForMember, wonBeerSummaryForMember } from '@/lib/db/queries/match-bet-summary';
import { groupTabEntriesByBeer } from '@/lib/tab/group-beer-breakdown';
import { joinSideNames } from '@/lib/format/match-sides';
import { onBehalfReviewSummaryForMember } from '@/lib/db/queries/on-behalf-review';
import { formatMoney } from '@/lib/format';

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
    otherMembers,
    onBehalfSummary,
  ] = await Promise.all([
    memberBalance(ctx.member.id),
    lastBeerForMember(ctx.member.id, ctx.club.id),
    getBeerTypeCatalog(ctx.club.id),
    matchBetSummaryForMember(ctx.member.id, ctx.club.id),
    wonBeerSummaryForMember(ctx.member.id, ctx.club.id),
    listOpenAgreementsForMember(ctx.club.id, ctx.member.id),
    listOtherActiveMembers(ctx.club.id, ctx.member.id),
    onBehalfReviewSummaryForMember(ctx.member.id, ctx.club.id),
  ]);

  // Spec 028 — this round's beer breakdown, shown on home so the
  // member sees what they've had this evening right after logging,
  // and can settle when they call it a day. Scoped to the open round.
  const openSession = await getOpenSessionForClub(ctx.club.id);
  const tab = openSession
    ? await getMyTabForSession({
        memberId: ctx.member.id,
        userId: ctx.user.id,
        session: openSession,
        undoWindowSeconds: ctx.club.consumptionUndoWindowSeconds,
      })
    : null;
  const roundGroups = tab ? groupTabEntriesByBeer(tab.entries) : [];

  // Project for the OpenMatchPrompt component.
  const myOpenMatches = openAgreements.map((a) => ({
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
        {/* Only surface the balance when there's actually something to
            pay — "all settled" needs no announcement on the home page. */}
        {owes ? (
          <p className="text-primary text-xl font-bold tabular-nums leading-relaxed">
            {t('balanceOwed', { amount: balanceFormatted })}
          </p>
        ) : null}
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
        wonPayerName={wonSummary.payerName}
      />

      <HomeOneTapLog
        beer={lastBeer}
        catalog={inStockCatalog}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
      />

      {/* Onboarding nudge for a fresh club with no beers: the one-tap
          button above renders disabled but gives no clue what to do
          about it. Stock-managers+ get a direct link to seed the
          catalog; everyone else gets a "ask your admin" hint. */}
      {catalog.length === 0 ? (
        roleSatisfies(ctx.member.role, 'stock_manager') ? (
          <Card className="border-primary/30 flex flex-col gap-2 p-4 text-sm">
            <p>{t('emptyCatalogAdmin')}</p>
            <Link
              href={'/admin/beer-types' as Route}
              className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('emptyCatalogAdminCta')}
            </Link>
          </Card>
        ) : (
          <p className="text-muted-foreground text-center text-sm">{t('emptyCatalogMember')}</p>
        )
      ) : null}

      {/* This round's beer breakdown — "Pilsner ×3 · 120 Kč" — so the
          member sees what they've had this evening right after logging.
          Round-scoped (current open session); renders nothing when the
          round has no countable beers yet. */}
      <TabBeerBreakdown
        groups={roundGroups}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
        now={new Date()}
      />

      {/* Quick settle — prominent full-width button right under the
          round breakdown so calling it a day is one tap. Only when
          the member owes. */}
      {owes ? (
        <Link
          href={'/settle' as Route}
          className={buttonVariants({ size: 'lg', className: 'h-14 w-full text-base' })}
        >
          {t('settleCta')}
        </Link>
      ) : null}

      {otherMembers.length > 0 ? (
        <HomeLogForOther
          members={otherMembers}
          beers={inStockCatalog}
          currencyCode={ctx.club.currencyCode}
          locale={ctx.club.defaultLocale}
        />
      ) : null}
    </main>
  );
}
