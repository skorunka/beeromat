import { useTranslations } from 'next-intl';

import type { MemberStats } from '@/lib/stats/types';
import type { BadgeKey, BadgeView } from '@/lib/achievements/types';
import { BADGE_FAMILIES, SINGLE_BADGES } from '@/lib/achievements/catalog';
import { buildGalleryViews } from '@/lib/achievements/family-view';
import { AchievementsGallery } from './achievements-gallery';

// Spec 035 + 037 + 038 — the game-style badge gallery. Shows every badge: tiered
// families as one tile at the member's highest earned tier (+ progress to next),
// single badges as earned/locked. This server component assembles the BadgeView[]
// (via the pure buildGalleryViews) + the header/count; the interactive filter/sort
// + grid live in the client <AchievementsGallery> (spec 037).
export function AchievementsSection({
  stats,
  earned,
  rarity,
}: {
  stats: MemberStats;
  earned: { key: BadgeKey; earnedAt: Date }[];
  rarity?: { holdersByKey: Record<BadgeKey, number>; clubMembers: number } | null;
}) {
  const t = useTranslations('achievement');
  const views = buildGalleryViews(stats, earned, rarity);

  // Default order: earned first (newest first), then the catalog order from
  // buildGalleryViews (families then singles).
  const index = new Map(views.map((v, i) => [v.key, i]));
  const sorted = [...views].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned && b.earned) {
      return (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0);
    }
    return index.get(a.key)! - index.get(b.key)!;
  });

  const total = BADGE_FAMILIES.length + SINGLE_BADGES.length;
  const earnedCount = views.filter((v) => v.earned).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('sectionTitle')}
        </h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t('earnedCount', { earned: earnedCount, total })}
        </span>
      </div>
      {earnedCount === 0 ? <p className="text-muted-foreground text-sm">{t('empty')}</p> : null}
      <AchievementsGallery views={sorted} />
    </section>
  );
}
