import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireUnlocked } from '@/lib/auth/session';
import { getLeaderboards } from '@/lib/db/queries/leaderboards';
import { SEASON_DAYS } from '@/lib/stats/constants';
import { LeaderboardBoard } from '@/components/stats/leaderboard-board';
import { ScopeToggle } from '@/components/stats/scope-toggle';
import { BoardSelect } from '@/components/stats/board-select';
import type { BoardKey, Scope } from '@/lib/stats/types';

const BOARD_KEYS: BoardKey[] = [
  'beers',
  'tab',
  'wins',
  'played',
  'winRate',
  'streak',
  'boughtForOthers',
];

// Spec 034 (+ follow-up) — the club leaderboards. ONE board shown at a time,
// picked via the ?board= dropdown (default 'beers'); all-time/season via
// ?scope=. Server-rendered; boards are SQL-aggregated (getLeaderboards).
export default async function LeaderboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string; board?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { scope: scopeParam, board: boardParam } = await searchParams;
  const scope: Scope = scopeParam === 'season' ? 'season' : 'allTime';
  const board: BoardKey =
    boardParam && (BOARD_KEYS as string[]).includes(boardParam)
      ? (boardParam as BoardKey)
      : 'beers';

  const ctx = await requireUnlocked();
  const t = await getTranslations('stats');
  const boards = await getLeaderboards({
    clubId: ctx.club.id,
    viewerMemberId: ctx.member.id,
    scope,
  });
  // Plain loop (not .find(=>)) to avoid the i18n-check JSX-text false-positive
  // on the arrow — this page carries real t() strings, so it stays scanned.
  let selected = boards[0];
  for (const b of boards) if (b.key === board) selected = b;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <header>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <ScopeToggle scope={scope} board={board} />
      {scope === 'season' ? (
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          {t('seasonNote', { days: SEASON_DAYS })}
        </p>
      ) : null}

      <BoardSelect current={board} scope={scope} />

      {selected ? (
        <LeaderboardBoard
          board={selected}
          viewerMemberId={ctx.member.id}
          currencyCode={ctx.club.currencyCode}
          locale={ctx.club.defaultLocale}
        />
      ) : null}
    </main>
  );
}
