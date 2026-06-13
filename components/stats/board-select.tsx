import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BoardKey, Scope } from '@/lib/stats/types';

// Spec 034 follow-up — the leaderboards switcher. ONE board shown at a time; this
// is the chip grid that picks it (emoji + label, active chip filled). Chips WRAP
// (no horizontal scroll) so all 7 stay visible + clickable on any width — a hidden-
// scrollbar strip was unreachable with a mouse on desktop. Pure server-rendered
// Links carrying ?board= (+ ?scope=) — shareable, no client state. The picked
// board's full name also shows in the board heading just below.

const BOARDS: { key: BoardKey; emoji: string }[] = [
  { key: 'beers', emoji: '🍺' },
  { key: 'tab', emoji: '💸' },
  { key: 'wins', emoji: '🏆' },
  { key: 'played', emoji: '🎾' },
  { key: 'winRate', emoji: '📈' },
  { key: 'streak', emoji: '🔥' },
  { key: 'boughtForOthers', emoji: '🤝' },
];

export function BoardSelect({ current, scope }: { current: BoardKey; scope: Scope }) {
  const t = useTranslations('stats');
  return (
    <div className="flex flex-wrap gap-2">
      {BOARDS.map((b) => {
        const active = b.key === current;
        const href = (
          scope === 'season'
            ? `/leaderboards?board=${b.key}&scope=season`
            : `/leaderboards?board=${b.key}`
        ) as Route;
        return (
          <Link
            key={b.key}
            href={href}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <span aria-hidden>{b.emoji}</span>
            {t(`board.${b.key}`)}
          </Link>
        );
      })}
    </div>
  );
}
