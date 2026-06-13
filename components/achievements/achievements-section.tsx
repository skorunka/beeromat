import { useTranslations } from 'next-intl';

import type { MemberStats } from '@/lib/stats/types';
import type { BadgeKey, BadgeView } from '@/lib/achievements/types';
import { BADGES } from '@/lib/achievements/catalog';
import { AchievementsGallery } from './achievements-gallery';

// Spec 035 — the game-style badge gallery. Shows the WHOLE catalog (FR-001):
// earned badges (vivid + date) sorted ahead of locked ones (dimmed + progress
// bar). Progress is computed in-render from `stats` (a pure fn — no I/O, no
// write); claimed state + dates come from the persisted `earned` rows.
//
// Spec 037 — this server component still assembles the BadgeView[] (+ rarity) in
// the default order; the interactive filter/sort + grid live in the client
// <AchievementsGallery>, so the data stays server-built and only the controls
// are client.
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
  const earnedAtByKey = new Map(earned.map((e) => [e.key, e.earnedAt]));
  const order = new Map(BADGES.map((b, i) => [b.key, i]));

  const views: BadgeView[] = BADGES.map((b) => {
    const earnedAt = earnedAtByKey.get(b.key) ?? null;
    const view: BadgeView = {
      key: b.key,
      emoji: b.emoji,
      earned: earnedAt !== null,
      earnedAt,
      progress: b.progress(stats),
    };
    if (rarity) {
      view.holders = rarity.holdersByKey[b.key] ?? 0;
      view.clubMembers = rarity.clubMembers;
    }
    return view;
  });

  // Default order: earned first (newest first), then locked in catalog order.
  // This is the gallery's "default" view; the client controls reshuffle from here.
  const sorted = [...views].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned && b.earned) return b.earnedAt!.getTime() - a.earnedAt!.getTime();
    return order.get(a.key)! - order.get(b.key)!;
  });

  const earnedCount = views.filter((v) => v.earned).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('sectionTitle')}
        </h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t('earnedCount', { earned: earnedCount, total: BADGES.length })}
        </span>
      </div>
      {earnedCount === 0 ? <p className="text-muted-foreground text-sm">{t('empty')}</p> : null}
      <AchievementsGallery views={sorted} />
    </section>
  );
}
