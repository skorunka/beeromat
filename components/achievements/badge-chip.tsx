import { useLocale, useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BadgeProgress, Tier } from '@/lib/achievements/types';

// Spec 035 + 038 — one tile in the gallery. Single badge: vivid + date when earned,
// dimmed + condition + progress when locked. Tiered family: the highest earned tier
// (bronze/silver/gold cue + label) with a progress bar toward the NEXT tier (until
// gold = complete). All copy flows through the achievement.* catalog.

const TIER_MEDAL: Record<Tier, string> = { bronze: '🥉', silver: '🥈', gold: '🥇' };
// Static keys (not a template literal) so the i18n-check resolves them.
const TIER_LABEL_KEY: Record<Tier, string> = {
  bronze: 'achievement.tier.bronze',
  silver: 'achievement.tier.silver',
  gold: 'achievement.tier.gold',
};

export function BadgeChip({
  emoji,
  nameKey,
  conditionKey,
  tier,
  earned,
  earnedAt,
  progress,
  holders,
  clubMembers,
}: {
  emoji: string;
  /** Full catalog keys, e.g. `achievement.badge.centuryClub.name`. */
  nameKey: string;
  /** Single badges only; families convey the goal via the progress bar. */
  conditionKey?: string;
  /** Set for tiered families: the highest earned tier (or bronze when locked). */
  tier?: Tier;
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
  // Show the bar while there's something to chase: any locked badge, or a tiered
  // family not yet at its top threshold (so silver still shows progress to gold).
  const showProgress = !earned || (tier !== undefined && progress.current < progress.target);

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
        <span className="min-w-0 text-sm font-semibold leading-tight">{t(nameKey)}</span>
        {tier && earned ? (
          <span className="ml-auto shrink-0 text-xs font-medium" title={t(TIER_LABEL_KEY[tier])}>
            <span aria-hidden>{TIER_MEDAL[tier]}</span> {t(TIER_LABEL_KEY[tier])}
          </span>
        ) : null}
      </div>

      {conditionKey ? <span className="text-muted-foreground text-xs">{t(conditionKey)}</span> : null}

      {earned && earnedAt ? (
        <span className="text-primary text-xs font-medium">
          {t('achievement.earnedOn', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(earnedAt),
          })}
        </span>
      ) : null}

      {showProgress ? (
        <div className="mt-1 flex flex-col gap-1">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary/60 h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {t('achievement.progress', { current: progress.current, target: progress.target })}
          </span>
        </div>
      ) : null}

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
