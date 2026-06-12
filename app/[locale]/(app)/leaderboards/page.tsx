import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireUnlocked } from '@/lib/auth/session';
import { getLeaderboards } from '@/lib/db/queries/leaderboards';
import { SEASON_DAYS } from '@/lib/stats/constants';
import { LeaderboardBoard } from '@/components/stats/leaderboard-board';
import { ScopeToggle } from '@/components/stats/scope-toggle';
import type { Scope } from '@/lib/stats/types';

// Spec 034 — the club leaderboards. 7 boards, all-time/season toggle via
// ?scope. Server-rendered; boards are SQL-aggregated (getLeaderboards).
export default async function LeaderboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { scope: scopeParam } = await searchParams;
  const scope: Scope = scopeParam === 'season' ? 'season' : 'allTime';

  const ctx = await requireUnlocked();
  const t = await getTranslations('stats');
  const boards = await getLeaderboards({
    clubId: ctx.club.id,
    viewerMemberId: ctx.member.id,
    scope,
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <ScopeToggle scope={scope} />
      {scope === 'season' ? (
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          {t('seasonNote', { days: SEASON_DAYS })}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {boards.map((board) => (
          <LeaderboardBoard
            key={board.key}
            board={board}
            viewerMemberId={ctx.member.id}
            currencyCode={ctx.club.currencyCode}
            locale={ctx.club.defaultLocale}
          />
        ))}
      </div>
    </main>
  );
}
