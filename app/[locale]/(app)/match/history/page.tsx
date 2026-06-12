import type { Route } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { RecentResultsList } from '../RecentResultsList';
import { requireUnlocked } from '@/lib/auth/session';
import { listRecentResults } from '@/lib/db/queries/match-agreements';

// Full match history — the complete results list, kept off the /match hub
// so the hub stays light. Bounded at a generous cap (newest first) so the
// page stays fast even for a club with thousands of matches.
const HISTORY_LIMIT = 100;

export default async function MatchHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('match');
  const results = await listRecentResults(ctx.club.id, HISTORY_LIMIT);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('historyTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('historySubtitle')}</p>
        </div>
        <Link href={'/match' as Route} className="text-primary shrink-0 text-sm underline">
          ← {t('hubTitle')}
        </Link>
      </header>

      {results.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('historyEmpty')}</p>
      ) : (
        <section className="flex flex-col gap-3">
          <RecentResultsList results={results} />
          {results.length >= HISTORY_LIMIT ? (
            <p className="text-muted-foreground text-center text-xs">
              {t('historyCap', { count: HISTORY_LIMIT })}
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}
