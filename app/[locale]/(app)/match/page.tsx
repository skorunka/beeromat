import { getTranslations, setRequestLocale } from 'next-intl/server';

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
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('hubTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('hubSubtitle')}</p>
      </header>

      <section className="mb-8 flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('upcomingHeading')}</h2>
        <UpcomingAgreementsList agreements={agreements} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('newMatchHeading')}</h2>
        <NewMatchAgreementForm members={members} />
      </section>
    </main>
  );
}
