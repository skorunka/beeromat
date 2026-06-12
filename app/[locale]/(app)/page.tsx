import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Receipt } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { roleSatisfies } from '@/lib/permissions';
import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import { MatchBetModule } from '@/components/home/match-bet-module';
import { OpenMatchPrompt } from '@/components/home/open-match-prompt';
import { NextSessionCard } from '@/components/events/next-session-card';
import { OnBehalfReviewBanner } from '@/components/home/on-behalf-review-banner';
import { TabBeerBreakdown } from '@/components/tab/tab-beer-breakdown';
import { HomeLogForOther } from '@/components/home/home-log-for-other';
import { requireUnlocked } from '@/lib/auth/session';
import { getMyBalance } from '@/lib/db/queries/payments';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { getMyTabForSession, lastBeerForMember } from '@/lib/db/queries/consumption';
import { listOtherActiveMembers } from '@/lib/db/queries/members';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { listOpenAgreementsForMember } from '@/lib/db/queries/match-agreements';
import { getOccurrenceDetail, listOpenThisWeek } from '@/lib/db/queries/events';
import { listBeerDebtsForMember, wonBeerCountForMember } from '@/lib/db/queries/match-bet-debts';
import { groupTabEntriesByBeer } from '@/lib/tab/group-beer-breakdown';
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
  const now = new Date();
  const [
    myBalance,
    lastBeer,
    catalog,
    beerDebts,
    wonBeers,
    openAgreements,
    otherMembers,
    onBehalfSummary,
    openEvents,
  ] = await Promise.all([
    getMyBalance(ctx.member.id, ctx.club.currencyCode),
    lastBeerForMember(ctx.member.id, ctx.club.id),
    getBeerTypeCatalog(ctx.club.id),
    listBeerDebtsForMember({ clubId: ctx.club.id, memberId: ctx.member.id }),
    wonBeerCountForMember({ clubId: ctx.club.id, memberId: ctx.member.id }),
    listOpenAgreementsForMember(ctx.club.id, ctx.member.id),
    listOtherActiveMembers(ctx.club.id, ctx.member.id),
    onBehalfReviewSummaryForMember(ctx.member.id, ctx.club.id),
    listOpenThisWeek(ctx.club.id, ctx.member.id, now),
  ]);
  // The nearest open session (soonest startsAt) for the home RSVP card.
  // Pull its roster for the who's-going avatar strip (already sorted
  // going-first / earliest-opt-in-first by getOccurrenceDetail).
  const nextEvent = openEvents[0] ?? null;
  const nextEventDetail = nextEvent
    ? await getOccurrenceDetail(nextEvent.occurrenceId, ctx.club.id)
    : null;
  const nextEventGoing =
    nextEventDetail?.roster
      .filter((r) => {
        return r.status === 'going';
      })
      .map((r) => ({
        memberId: r.memberId,
        displayName: r.displayName,
        avatarKey: r.avatarKey,
        avatarUploadAt: r.avatarUploadAt,
        rsvpUpdatedAt: r.rsvpUpdatedAt,
      })) ?? [];

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
    forBeer: a.forBeer,
    sideA: a.sides.A,
    sideB: a.sides.B,
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
  const { balanceMinor, pendingConfirmationMinor } = myBalance;
  const owes = balanceMinor > 0n;
  // A negative balance means the member has paid in more than they've
  // consumed (treasurer cash entry / "paid other way" overshoot, or a
  // reversed charge). Without this the `owes`-gated UI hides it entirely
  // and a member the club now owes sees nothing.
  const hasCredit = balanceMinor < 0n;
  // A claimed-but-unconfirmed payment covering the balance → calm
  // "awaiting confirmation" state instead of the owed nag + settle CTA.
  // A partial claim (pending < balance) still shows owed, with a note.
  const hasPendingClaim = pendingConfirmationMinor > 0n;
  const awaitingConfirmation = owes && pendingConfirmationMinor >= balanceMinor;
  const balanceFormatted = formatMoney(
    balanceMinor,
    ctx.club.currencyCode,
    ctx.club.defaultLocale,
  );
  const creditFormatted = formatMoney(
    -balanceMinor,
    ctx.club.currencyCode,
    ctx.club.defaultLocale,
  );
  const pendingFormatted = formatMoney(
    pendingConfirmationMinor,
    ctx.club.currencyCode,
    ctx.club.defaultLocale,
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/account"
            className="text-foreground hover:text-primary inline-flex min-h-11 items-center text-base font-medium transition-colors"
          >
            {t('greeting', { name: ctx.member.displayName })}
          </Link>
          {/* Lifetime won-beer brag — a compact 🏆 badge tucked beside the
              greeting (spec 030 follow-up) instead of eating its own row.
              Full "{count} vyhraná piva" copy on hover. */}
          {wonBeers > 0 ? (
            <span
              className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums"
              title={t('wonBeersTotal', { count: wonBeers })}
            >
              🏆 {wonBeers}
            </span>
          ) : null}
        </div>
        {/* The owed amount itself lives on the Útrata card below (its
            corner total) — here we keep only the status notes that the
            card doesn't carry: payment awaiting confirmation, or a
            partial pending claim. */}
        {awaitingConfirmation ? (
          <p className="text-muted-foreground text-base font-medium">
            {t('balanceAwaiting')}
          </p>
        ) : owes && hasPendingClaim ? (
          <p className="text-muted-foreground text-sm">
            {t('balancePendingNote', { amount: pendingFormatted })}
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

      {/* Útrata — the whole money loop in ONE card, mirroring the
          SRAZ / ZÁPAS card pattern (eyebrow + corner total + content +
          a single CTA): the total badge, log at the top, this round's
          breakdown, settle at the bottom. Sits right under the header
          so the daily loop reads owe → log → tab → settle. */}
      <Card className="border-primary/30 flex flex-col gap-4 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide uppercase">
            <Receipt className="text-primary h-4 w-4" aria-hidden />
            {t('utrataHeading')}
          </h2>
          {owes ? (
            <span className="text-primary text-2xl font-bold tabular-nums">{balanceFormatted}</span>
          ) : hasCredit ? (
            <span className="text-base font-medium tabular-nums">{creditFormatted}</span>
          ) : null}
        </div>

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
            <div className="flex flex-col gap-2 text-sm">
              <p>{t('emptyCatalogAdmin')}</p>
              <Link
                href={'/admin/beer-types' as Route}
                className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline"
              >
                {t('emptyCatalogAdminCta')}
              </Link>
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-sm">{t('emptyCatalogMember')}</p>
          )
        ) : null}

        {/* This round's per-beer breakdown — "Pilsner ×3 · 120 Kč".
            'bare' so this card owns the eyebrow + total above; renders
            nothing when the round has no countable beers yet. */}
        {roundGroups.length > 0 ? (
          <TabBeerBreakdown
            variant="bare"
            groups={roundGroups}
            currencyCode={ctx.club.currencyCode}
            locale={ctx.club.defaultLocale}
            now={new Date()}
          />
        ) : null}

        {/* Settle — one tap to call it a day. Only when the member owes
            AND hasn't already claimed a covering payment. */}
        {owes && !awaitingConfirmation ? (
          <Link
            href={'/settle' as Route}
            className={buttonVariants({ size: 'lg', className: 'h-14 w-full text-base' })}
          >
            {t('settleCta')}
          </Link>
        ) : null}
      </Card>

      {/* Log for someone else — a logging action, so it sits with the
          consumption flow right under the Útrata card (log for yourself
          → log for a teammate), not stranded below the match/event. */}
      {otherMembers.length > 0 ? (
        <HomeLogForOther
          members={otherMembers}
          beers={inStockCatalog}
          currencyCode={ctx.club.currencyCode}
          locale={ctx.club.defaultLocale}
        />
      ) : null}

      {/* The beer-bet match and the "Piva k předání" IOUs it produces are
          one connected story — keep them together, right under the money
          card: record a match → it mints the beer-IOUs just below it. */}
      <OpenMatchPrompt matches={myOpenMatches} />

      <MatchBetModule
        debts={beerDebts}
        beers={inStockCatalog}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
        now={now}
      />

      {/* Tonight's session RSVP — a separate concern, below the match pair. */}
      {nextEvent ? (
        <NextSessionCard
          session={nextEvent}
          going={nextEventGoing}
          now={now}
          locale={ctx.club.defaultLocale}
        />
      ) : null}
    </main>
  );
}
