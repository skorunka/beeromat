import { toast } from 'sonner';

import { celebrateBeer } from '@/lib/celebrate';
import { badgeDisplay } from '@/lib/achievements/catalog';
import type { BadgeKey } from '@/lib/achievements/types';

// Spec 035 + 038 — the in-the-moment unlock celebration. When an action returns
// newly-earned badge keys for the actor, fire the existing 🍻 overlay once and a
// toast per badge naming it ("Century Club — Silver 🍺" for a tier). `t` is the
// `achievement`-namespaced translator. No-op when nothing new was earned.
type AchTranslate = (key: string, values?: Record<string, string | number>) => string;

export function celebrateUnlocks(keys: BadgeKey[] | undefined, t: AchTranslate) {
  if (!keys || keys.length === 0) return;
  celebrateBeer();
  for (const key of keys) {
    const d = badgeDisplay(key);
    if (!d) continue;
    // d.nameKey is a full catalog key ("achievement.badge.<k>.name"); the translator
    // is already scoped to "achievement", so strip the prefix.
    const name = t(d.nameKey.replace(/^achievement\./, ''));
    const label = d.tier ? `${name} — ${t(`tier.${d.tier}`)} ${d.emoji}` : `${name} ${d.emoji}`;
    toast.success(t('unlocked', { badge: label }));
  }
}
