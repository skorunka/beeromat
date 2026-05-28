import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { NewMatchAgreementForm } from './NewMatchAgreementForm';
import { UpcomingAgreementsList } from './UpcomingAgreementsList';
import { requireUnlocked } from '@/lib/auth/session';
import {
  listActiveClubMembers,
  listOpenAgreements,
} from '@/lib/db/queries/match-agreements';

// Spec 013 — /match hub: Upcoming agreements list on top, New match
// form below. The legacy 012 one-step quick-log UI is sunset per
// FR-017 (full removal happens in US2; for now the agreement flow is
// the only entry point).

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

      <section id="new-match" className="flex flex-col gap-3 scroll-mt-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('newMatchHeading')}</h2>
        <NewMatchAgreementForm members={members} />
      </section>

      {/* Disambiguate from the casual /bet "take a drink" flow — a
          recurring confusion in the persona panel. */}
      <p className="text-muted-foreground mt-8 text-center text-xs">
        {t.rich('settleHint', {
          link: (chunks) => (
            <Link href="/bet" className="underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </main>
  );
}
