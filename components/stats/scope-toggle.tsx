import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BoardKey, Scope } from '@/lib/stats/types';

// Spec 034 — all-time / this-season segmented control. Link-based (the scope
// lives in ?scope=), so the leaderboards page stays a server component with no
// client state and the scope is shareable. Carries the current ?board= so
// flipping scope keeps you on the same board (spec 034 follow-up).

const ITEM = 'flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors';

export function ScopeToggle({ scope, board }: { scope: Scope; board: BoardKey }) {
  const t = useTranslations('stats');
  const allTimeHref = `/leaderboards?board=${board}` as Route;
  const seasonHref = `/leaderboards?board=${board}&scope=season` as Route;
  return (
    <div className="bg-card border-border flex gap-1 rounded-lg border p-1">
      <Link
        href={allTimeHref}
        aria-current={scope === 'allTime' ? 'true' : undefined}
        className={cn(
          ITEM,
          scope === 'allTime'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {t('scopeAllTime')}
      </Link>
      <Link
        href={seasonHref}
        aria-current={scope === 'season' ? 'true' : undefined}
        className={cn(
          ITEM,
          scope === 'season'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {t('scopeSeason')}
      </Link>
    </div>
  );
}
