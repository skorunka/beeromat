import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BoardKey, Scope } from '@/lib/stats/types';

// Spec 034 follow-up — the leaderboards switcher. ONE board shown at a time; this
// is the horizontally-scrollable chip strip that picks it (emoji + label, active
// chip filled). Every board is visible up-front (unlike the old dropdown), one tap
// to switch. Pure server-rendered Links carrying ?board= (+ ?scope=) — shareable,
// no client state. The picked board's full name also shows in the board heading
// just below, so the strip stays glanceable.

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
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
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
