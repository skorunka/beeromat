import { useLocale, useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BadgeProgress } from '@/lib/achievements/types';

// Spec 035 — one badge tile in the gallery. Earned: vivid + earned date.
// Locked: dimmed + a progress bar toward the goal. Condition is shown for BOTH
// (FR-002). All copy flows through the achievement.* catalog — no literal text.
export function BadgeChip({
  emoji,
  nameKey,
  conditionKey,
  earned,
  earnedAt,
  progress,
  holders,
  clubMembers,
}: {
  emoji: string;
  /** Full catalog keys, e.g. `achievement.badge.centuryClub.name`. */
  nameKey: string;
  conditionKey: string;
  earned: boolean;
  earnedAt: Date | null;
  progress: BadgeProgress;
  holders?: number;
  clubMembers?: number;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pct =
    progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0;
  const showRarity = typeof holders === 'number' && typeof clubMembers === 'number';

  return (
    <Card
      className={cn(
        'flex flex-col gap-1 p-3',
        earned ? 'border-primary/40 bg-primary/5' : 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('text-2xl leading-none', !earned && 'grayscale')} aria-hidden>
          {emoji}
        </span>
        <span className="text-sm font-semibold leading-tight">{t(nameKey)}</span>
      </div>
      <span className="text-muted-foreground text-xs">{t(conditionKey)}</span>

      {earned && earnedAt ? (
        <span className="text-primary text-xs font-medium">
          {t('achievement.earnedOn', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(earnedAt),
          })}
        </span>
      ) : null}

      {earned ? null : (
        <div className="mt-1 flex flex-col gap-1">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary/60 h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {t('achievement.progress', { current: progress.current, target: progress.target })}
          </span>
        </div>
      )}

      {showRarity ? (
        <span className="text-muted-foreground text-[11px]">
          {holders! > 0
            ? t('achievement.rarity', { holders: holders!, total: clubMembers! })
            : t('achievement.rarityNone')}
        </span>
      ) : null}
    </Card>
  );
}
