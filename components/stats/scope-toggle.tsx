import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import type { Scope } from '@/lib/stats/types';

// Spec 034 — all-time / this-season segmented control. Link-based (the scope
// lives in ?scope=), so the leaderboards page stays a server component with no
// client state and the scope is shareable.

export function ScopeToggle({ scope }: { scope: Scope }) {
  const t = useTranslations('stats');
  const Item = ({ value, label }: { value: Scope; label: string }) => (
    <Link
      href={(value === 'season' ? '/leaderboards?scope=season' : '/leaderboards') as Route}
      aria-current={scope === value ? 'true' : undefined}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors',
        scope === value
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="bg-card border-border flex gap-1 rounded-lg border p-1">
      <Item value="allTime" label={t('scopeAllTime')} />
      <Item value="season" label={t('scopeSeason')} />
    </div>
  );
}
