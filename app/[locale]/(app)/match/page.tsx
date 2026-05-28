import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BetSettleSection } from './BetSettleSection';
import { NewMatchAgreementForm } from './NewMatchAgreementForm';
import { UpcomingAgreementsList } from './UpcomingAgreementsList';
import { requireUnlocked } from '@/lib/auth/session';
import {
  listActiveClubMembers,
  listOpenAgreements,
} from '@/lib/db/queries/match-agreements';

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
  const [agreements, members] = await Promise.all([
    listOpenAgreements(ctx.club.id),
    listActiveClubMembers(ctx.club.id),
  ]);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('hubTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('hubSubtitle')}</p>
        </div>
        {/* Jump straight to the form so creating a match never means
            scrolling past a long Upcoming list (usability follow-up). */}
        <a
          href="#new-match"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium"
        >
          {t('newMatchCta')}
        </a>
      </header>

      <section className="mb-8 flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('upcomingHeading')}</h2>
        <UpcomingAgreementsList agreements={agreements} />
      </section>

      <div className="mb-8">
        <BetSettleSection
          clubId={ctx.club.id}
          memberId={ctx.member.id}
          userId={ctx.user.id}
          role={ctx.member.role}
          currencyCode={ctx.club.currencyCode}
          locale={ctx.club.defaultLocale}
        />
      </div>

      <section id="new-match" className="flex flex-col gap-3 scroll-mt-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('newMatchHeading')}</h2>
        <NewMatchAgreementForm members={members} />
      </section>
    </main>
  );
}
