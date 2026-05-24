import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MatchForm } from './MatchForm';
import { requireUnlocked } from '@/lib/auth/session';
import { listOpponentsForMember } from '@/lib/db/queries/matches';

// Spec 012 — /match page. Opponent picker + I won / I lost buttons.
// The action is best-effort: creates the matches row always; creates
// N bet_transfer rows when the winner has eligible recent consumptions
// in the open session.

export default async function MatchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('match');
  const opponents = await listOpponentsForMember(ctx.club.id, ctx.member.id);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <MatchForm opponents={opponents} />
    </main>
  );
}
