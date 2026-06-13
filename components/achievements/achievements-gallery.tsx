'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { BadgeView } from '@/lib/achievements/types';
import {
  applyGalleryView,
  canSortByRarity,
  type GalleryFilter,
  type GallerySort,
} from '@/lib/achievements/gallery-view';
import { BadgeChip } from './badge-chip';

// Spec 037 — client controls (filter + sort) over the server-built BadgeView[].
// Pure reshuffle via applyGalleryView; default view = the order the section
// passed in. Strings via useTranslations('achievement'); chip styling matches
// the scope toggle / board chips.

const FILTERS: GalleryFilter[] = ['all', 'earned', 'locked'];
const FILTER_LABEL: Record<GalleryFilter, string> = {
  all: 'filterAll',
  earned: 'filterEarned',
  locked: 'filterLocked',
};
const SORT_LABEL: Record<GallerySort, string> = {
  default: 'sortDefault',
  closest: 'sortClosest',
  rarest: 'sortRarest',
};

const CHIP_GROUP = 'bg-card border-border flex shrink-0 gap-1 rounded-lg border p-1';
const CHIP = 'rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors';
const CHIP_ON = 'bg-primary text-primary-foreground';
const CHIP_OFF = 'text-muted-foreground hover:text-foreground';

export function AchievementsGallery({ views }: { views: BadgeView[] }) {
  const t = useTranslations('achievement');
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [sort, setSort] = useState<GallerySort>('default');

  const sorts: GallerySort[] = canSortByRarity(views)
    ? ['default', 'closest', 'rarest']
    : ['default', 'closest'];
  const shown = applyGalleryView(views, { filter, sort });

  return (
    <div className="flex flex-col gap-2">
      {/* Filter group + sort group. Wraps onto a second line on a narrow
          screen rather than scrolling — both groups always fully visible. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={CHIP_GROUP}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(CHIP, filter === f ? CHIP_ON : CHIP_OFF)}
            >
              {t(FILTER_LABEL[f])}
            </button>
          ))}
        </div>
        <div className={CHIP_GROUP}>
          {sorts.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={cn(CHIP, sort === s ? CHIP_ON : CHIP_OFF)}
            >
              {t(SORT_LABEL[s])}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('filterEmpty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((v) => (
            <BadgeChip
              key={v.key}
              emoji={v.emoji}
              nameKey={v.nameKey}
              conditionKey={v.conditionKey}
              tier={v.tier}
              earned={v.earned}
              earnedAt={v.earnedAt}
              progress={v.progress}
              holders={v.holders}
              clubMembers={v.clubMembers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
