import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MatchBetModule } from '@/components/home/match-bet-module';
import { NewMatchAgreementForm } from './NewMatchAgreementForm';
import { RecentResultsList } from './RecentResultsList';
import { UpcomingAgreementsList } from './UpcomingAgreementsList';
import { RecreateLastMatchButton } from '@/components/match/recreate-last-match-button';
import { requireUnlocked } from '@/lib/auth/session';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { listBeerDebtsForMember } from '@/lib/db/queries/match-bet-debts';
import {
  lastAgreementForMember,
  listActiveClubMembers,
  listOpenAgreements,
  listRecentResults,
} from '@/lib/db/queries/match-agreements';
import { joinSideNames } from '@/lib/format/match-sides';

// /match hub — the single surface for everything bet/match-related.
// Spec 030: the old casual "take a drink" box is gone; bets are now the
// match IOUs, settled via the "Sázky k vyrovnání" list. Sections
// top→bottom: recreate · scheduled · recently played · new match ·
// bets to settle.

export default async function MatchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('match');
  const tMatchBet = await getTranslations('matchBet');
  const [agreements, members, lastMatch, recentResults, beerDebts, catalog] = await Promise.all([
    listOpenAgreements(ctx.club.id),
    listActiveClubMembers(ctx.club.id),
    lastAgreementForMember(ctx.club.id, ctx.member.id),
    listRecentResults(ctx.club.id),
    listBeerDebtsForMember({ clubId: ctx.club.id, memberId: ctx.member.id }),
    getBeerTypeCatalog(ctx.club.id),
  ]);

  // In-stock beers drive both the create-form bet-beer picker and the
  // deliver-time override dropdown.
  const inStockBeers = catalog
    .filter((b) => !b.isArchived && !b.isOutOfStock)
    .map((b) => ({
      id: b.id,
      name: b.name,
      currentStock: b.currentStock,
      unitPriceMinor: b.unitPriceMinor,
    }));

  const hasDebts = beerDebts.owedToMe.length > 0 || beerDebts.iOwe.length > 0;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('hubTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('hubSubtitle')}</p>
      </header>

      {/* ── Matches: recreate · scheduled · recently played · new ── */}

      {lastMatch ? (
        <div className="mb-6">
          <RecreateLastMatchButton
            sideA={joinSideNames(lastMatch.sides.A)}
            sideB={joinSideNames(lastMatch.sides.B)}
          />
        </div>
      ) : null}

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('upcomingHeading')}</h2>
        <UpcomingAgreementsList agreements={agreements} />
      </section>

      {recentResults.length > 0 ? (
        <section className="mb-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{t('recentHeading')}</h2>
          <RecentResultsList results={recentResults} />
        </section>
      ) : null}

      <details id="new-match" className="mb-8 scroll-mt-4">
        <summary className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          {t('newMatchCta')}
        </summary>
        <div className="border-border mt-3 rounded-xl border p-4">
          <NewMatchAgreementForm
            members={members}
            beers={inStockBeers}
            currencyCode={ctx.club.currencyCode}
            locale={ctx.club.defaultLocale}
          />
        </div>
      </details>

      {/* ── Bets to settle (the beer IOUs) ── */}
      <section className="border-border flex flex-col gap-3 border-t pt-6">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('toSettleHeading')}</h2>
        {hasDebts ? (
          <MatchBetModule
            debts={beerDebts}
            beers={inStockBeers}
            currencyCode={ctx.club.currencyCode}
            locale={ctx.club.defaultLocale}
            now={new Date()}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{tMatchBet('nothingToSettle')}</p>
        )}
      </section>
    </main>
  );
}
