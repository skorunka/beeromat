# Contract: tier catalog + reconcile (spec 038)

## Catalog (`lib/achievements/catalog.ts`)

```ts
export const BADGE_FAMILIES: readonly BadgeFamily[] = [
  { family: 'centuryClub', emoji: '💯', nameKey: 'achievement.badge.centuryClub.name',
    descriptionKey: '…desc', conditionKey: '…condition',
    stat: (s) => s.totalBeers,
    tiers: [
      { tier: 'bronze', key: 'centuryClub',       threshold: 100 },
      { tier: 'silver', key: 'centuryClubSilver', threshold: 250 },
      { tier: 'gold',   key: 'centuryClubGold',   threshold: 500 },
    ] },
  // … winner / regular / roundKing / nightOwl / connoisseur …
];
export const SINGLE_BADGES: readonly Badge[] = [ /* sharpshooter, hatTrick, onFire — 035 */ ];

/** Every catalog key the member currently qualifies for (families×tiers + singles). */
export function qualifyingBadgeKeys(stats: MemberStats): BadgeKey[];

/** Display info for any key (base/tier/single) — for the celebration + chip. */
export function badgeDisplay(key: BadgeKey): { nameKey: string; emoji: string; tier?: Tier };
```

**Guarantees** (unit-tested):
- `qualifyingBadgeKeys` returns bronze at the bronze threshold, +silver at silver, etc.
  (cumulative); singles via their `earned`. Pure.
- Every tier key resolves in `badgeDisplay` to its family name + tier.
- Bronze key === the family base key (backward compat with 035-awarded rows).

## Reconcile / backfill — UNCHANGED

`reconcileAchievements` + `reconcileAllClubMembers` already do
`insert(qualifyingBadgeKeys(stats)).onConflictDoNothing()`. Because the catalog now
lists tier keys, they award/ backfill tiers automatically — **no code change**.

**Guarantees** (integration-tested):
- At 250 beers, reconcile awards `centuryClub` + `centuryClubSilver` (not gold).
- Crossing to 500 later awards `centuryClubGold`; lower tiers remain.
- Sticky: voiding a beer back under 250 does NOT remove `centuryClubSilver`.
- Idempotent: re-running awards nothing new.

## Celebration (`celebrate-unlocks.ts`) — edit

```ts
// for each newly-earned key: const d = badgeDisplay(key);
// toast: d.tier ? t('unlocked', { badge: `${t(d.nameKey)} — ${t('achievement.tier.'+d.tier)} ${d.emoji}` })
//               : t('unlocked', { badge: `${t(d.nameKey)} ${d.emoji}` })
```
**Guarantee** (component-tested via the helper): a silver key toasts "Century Club — Silver 🍺".
