// Spec 037 — pure filter + sort over the already-built badge gallery. Client
// state drives {filter, sort}; this reshuffles BadgeView[] with no I/O. The
// default ({filter:'all', sort:'default'}) is an identity pass-through so the
// untouched gallery is byte-identical to spec 035's view.

import type { BadgeView } from './types';

export type GalleryFilter = 'all' | 'earned' | 'locked';
export type GallerySort = 'default' | 'closest' | 'rarest';

export interface GalleryViewState {
  filter: GalleryFilter;
  sort: GallerySort;
}

/** Progress ratio toward a badge's goal (0..1); 0 when target is 0. */
function ratio(v: BadgeView): number {
  return v.progress.target > 0 ? v.progress.current / v.progress.target : 0;
}

/** Filter then sort. `{all, default}` returns the input order unchanged. */
export function applyGalleryView(views: BadgeView[], { filter, sort }: GalleryViewState): BadgeView[] {
  const filtered =
    filter === 'all' ? views : views.filter((v) => (filter === 'earned' ? v.earned : !v.earned));

  if (sort === 'default') return filtered;

  const out = [...filtered];
  if (sort === 'closest') {
    // Locked badges first, nearest-to-unlock first; earned after (complete).
    // Array.sort is stable (ES2019+), so equal keys keep input order.
    out.sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? 1 : -1;
      if (!a.earned && !b.earned) return ratio(b) - ratio(a);
      return 0;
    });
  } else {
    // 'rarest' — fewest holders first; views without a holder count sort last.
    out.sort((a, b) => {
      const ha = a.holders;
      const hb = b.holders;
      if (ha === undefined && hb === undefined) return 0;
      if (ha === undefined) return 1;
      if (hb === undefined) return -1;
      return ha - hb;
    });
  }
  return out;
}

/** Whether the "rarest" sort should be offered (views carry holder counts). */
export function canSortByRarity(views: BadgeView[]): boolean {
  return views.some((v) => typeof v.holders === 'number');
}
