import { toast } from 'sonner';

import { celebrateBeer } from '@/lib/celebrate';
import { BADGE_BY_KEY } from '@/lib/achievements/catalog';
import type { BadgeKey } from '@/lib/achievements/types';

// Spec 035 — the in-the-moment unlock celebration. When an action returns
// newly-earned badges for the actor, fire the existing 🍻 overlay once and a
// toast per badge naming it. `t` is the `achievement`-namespaced translator
// (useTranslations('achievement')). No-op when nothing new was earned.
type AchTranslate = (key: string, values?: Record<string, string | number>) => string;

export function celebrateUnlocks(keys: BadgeKey[] | undefined, t: AchTranslate) {
  if (!keys || keys.length === 0) return;
  celebrateBeer();
  for (const key of keys) {
    const badge = BADGE_BY_KEY[key];
    toast.success(t('unlocked', { badge: `${t(`badge.${key}.name`)} ${badge.emoji}` }));
  }
}
