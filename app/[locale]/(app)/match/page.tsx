import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BetSettleSection } from './BetSettleSection';
import { NewMatchAgreementForm } from './NewMatchAgreementForm';
import { RecentResultsList } from './RecentResultsList';
import { UpcomingAgreementsList } from './UpcomingAgreementsList';
import { RecreateLastMatchButton } from '@/components/match/recreate-last-match-button';
import { requireUnlocked } from '@/lib/auth/session';
import {
  lastAgreementForMember,
  listActiveClubMembers,
  listOpenAgreements,
  listRecentResults,
} from '@/lib/db/queries/match-agreements';
import { joinSideNames } from '@/lib/format/match-sides';

// /match hub — the single surface for everything bet/match-related
// (2026-05-28: the standalone /bet "take a drink" page was folded in
// here). Sections top→bottom: open matches to record, casual bet
// settlement (take a drink), and the new-match form.

export default async function MatchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('match');
  const [agreements, members, lastMatch, recentResults] = await Promise.all([
    listOpenAgreements(ctx.club.id),
    listActiveClubMembers(ctx.club.id),
    lastAgreementForMember(ctx.club.id, ctx.member.id),
    listRecentResults(ctx.club.id),
  ]);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('hubTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('hubSubtitle')}</p>
      </header>

      {/* ── Matches: recreate · scheduled · recently played · new ── */}

      {/* Spec 027 — one-tap recreate of the member's last matchup.
          Rendered only when they have a prior match to clone. */}
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

      {/* The match surface finally shows matches you've *played*, not
          just open ones + bets (UX audit 2026-06-02). */}
      {recentResults.length > 0 ? (
        <section className="mb-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{t('recentHeading')}</h2>
          <RecentResultsList results={recentResults} />
        </section>
      ) : null}

      {/* Collapsed by default — the big form no longer dominates the
          page; tap to expand (UX audit 2026-06-02). */}
      <details id="new-match" className="mb-8 scroll-mt-4">
        <summary className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          {t('newMatchCta')}
        </summary>
        <div className="border-border mt-3 rounded-xl border p-4">
          <NewMatchAgreementForm members={members} />
        </div>
      </details>

      {/* ── Bets & session — visually separated from the match block ── */}
      <div className="border-border border-t pt-6">
        <BetSettleSection
          clubId={ctx.club.id}
          memberId={ctx.member.id}
          userId={ctx.user.id}
          role={ctx.member.role}
          currencyCode={ctx.club.currencyCode}
          locale={ctx.club.defaultLocale}
        />
      </div>
    </main>
  );
}
