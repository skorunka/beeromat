import { useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WINRATE_MIN_MATCHES } from '@/lib/stats/constants';
import type { BoardKey, BoardRow, Leaderboard } from '@/lib/stats/types';

// Spec 034 — one leaderboard board: emoji + title, top-N ranked rows with
// medals for the podium, the viewer's own row highlighted (and appended if
// they fall outside the shown rows). Read-only server component.

const BOARD: Record<BoardKey, { key: string; emoji: string }> = {
  beers: { key: 'board.beers', emoji: '🍺' },
  tab: { key: 'board.tab', emoji: '💸' },
  wins: { key: 'board.wins', emoji: '🏆' },
  played: { key: 'board.played', emoji: '🎾' },
  winRate: { key: 'board.winRate', emoji: '📈' },
  streak: { key: 'board.streak', emoji: '🔥' },
  boughtForOthers: { key: 'board.boughtForOthers', emoji: '🤝' },
};

const MEDAL = ['🥇', '🥈', '🥉'];

interface LeaderboardBoardProps {
  board: Leaderboard;
  viewerMemberId: string;
  currencyCode: string;
  locale: string;
}

export function LeaderboardBoard({
  board,
  viewerMemberId,
  currencyCode,
  locale,
}: LeaderboardBoardProps) {
  const t = useTranslations('stats');
  const meta = BOARD[board.key];

  const formatValue = (value: number): string => {
    if (board.key === 'tab') return formatMoney(BigInt(value), currencyCode, locale);
    if (board.key === 'winRate') return `${value}%`;
    return String(value);
  };

  const shownIds = new Set(board.rows.map((r) => r.memberId));
  const appendViewer = board.viewerRow && !shownIds.has(board.viewerRow.memberId);

  const Row = ({ row, dim }: { row: BoardRow; dim?: boolean }) => {
    const isViewer = row.memberId === viewerMemberId;
    const medal = row.rank <= 3 ? MEDAL[row.rank - 1] : null;
    return (
      <li
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-2 py-1.5',
          isViewer && 'bg-primary/10 ring-primary/40 ring-1',
          dim && 'opacity-80',
        )}
      >
        <span
          className="w-6 shrink-0 text-center text-sm font-bold tabular-nums"
          aria-label={`#${row.rank}`}
        >
          {medal ?? row.rank}
        </span>
        <MemberAvatar
          size="row"
          avatarKey={row.avatarKey}
          displayName={row.displayName}
          uploadUrl={avatarUploadUrl(row.memberId, row.avatarUploadAt)}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {row.displayName}
          {isViewer ? ` · ${t('you')}` : ''}
        </span>
        <span className="text-primary shrink-0 text-sm font-bold tabular-nums">
          {formatValue(row.value)}
        </span>
      </li>
    );
  };

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          <span aria-hidden>{meta.emoji}</span> {t(meta.key)}
        </h2>
        {board.key === 'winRate' ? (
          <span className="text-muted-foreground text-xs">
            {t('winRateNote', { count: WINRATE_MIN_MATCHES })}
          </span>
        ) : null}
      </div>

      {board.rows.length === 0 ? (
        <p className="text-muted-foreground py-2 text-center text-sm">{t('emptyBoard')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {board.rows.map((row) => (
            <Row key={row.memberId} row={row} />
          ))}
          {appendViewer && board.viewerRow ? (
            <>
              <li aria-hidden className="text-muted-foreground py-0.5 text-center text-xs">
                ⋯
              </li>
              <Row row={board.viewerRow} dim />
            </>
          ) : null}
        </ul>
      )}
    </Card>
  );
}
