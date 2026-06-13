'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Gem, LayoutGrid, List, Lock, Medal, Target, type LucideIcon } from 'lucide-react';

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
//
// Compact ICON chips (the Czech labels overflowed a one-line text strip): every
// chip is an icon; only the SELECTED chip in a group shows its label too, so
// both groups always fit on a single line. icon-only chips carry aria-label +
// title for a tooltip/screen-reader name.

const FILTERS: GalleryFilter[] = ['all', 'earned', 'locked'];
const FILTER_LABEL: Record<GalleryFilter, string> = {
  all: 'filterAll',
  earned: 'filterEarned',
  locked: 'filterLocked',
};
const FILTER_ICON: Record<GalleryFilter, LucideIcon> = {
  all: LayoutGrid,
  earned: Medal,
  locked: Lock,
};
const SORT_LABEL: Record<GallerySort, string> = {
  default: 'sortDefault',
  closest: 'sortClosest',
  rarest: 'sortRarest',
};
const SORT_ICON: Record<GallerySort, LucideIcon> = {
  default: List,
  closest: Target,
  rarest: Gem,
};

const CHIP_GROUP = 'bg-card border-border flex shrink-0 gap-1 rounded-lg border p-1';
const CHIP =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors';
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
      {/* Icon chips, one line. Only the selected chip in each group shows its
          label, so both groups stay compact and fit without scrolling. */}
      <div className="flex items-center gap-2">
        <div className={CHIP_GROUP}>
          {FILTERS.map((f) => {
            const Icon = FILTER_ICON[f];
            const on = filter === f;
            const label = t(FILTER_LABEL[f]);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() => setFilter(f)}
                className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {on && <span>{label}</span>}
              </button>
            );
          })}
        </div>
        <div className={CHIP_GROUP}>
          {sorts.map((s) => {
            const Icon = SORT_ICON[s];
            const on = sort === s;
            const label = t(SORT_LABEL[s]);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() => setSort(s)}
                className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {on && <span>{label}</span>}
              </button>
            );
          })}
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
