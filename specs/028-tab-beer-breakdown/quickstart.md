# Quickstart: Beer Breakdown on the Tab

## What it does

On `/tab`, above the chronological list, a member sees a breakdown of what they're paying for, grouped by beer type (and day): "Pilsner Urquell ×3 · 120 Kč", "Bernard 10° ×2 · 60 Kč". The breakdown total equals the tab total. The chronological list (with per-beer Undo) stays below.

## Manual walkthrough (dev)

1. Log 3× Pilsner and 2× Bernard from home (or `/match` round).
2. Open `/tab`. The breakdown shows "Pilsner ×3 · 120 Kč" and "Bernard ×2 · 60 Kč"; the grand-total card still reads 180 Kč; the chronological list is below, newest beer still has Undo.
3. Undo one Pilsner (within window) → breakdown updates to "Pilsner ×2 · 80 Kč".
4. Bet flow: lose a for-beer match → the picked-up beer appears in its type group; the breakdown total still equals the tab total. Win one → the won-away beer is absent.

### Empty
- A member with no beers this round sees no breakdown (existing empty state stands).

## Verify

```bash
pnpm test:unit tests/unit/group-beer-breakdown.spec.ts
pnpm test:component tests/component/tab-beer-breakdown.spec.tsx
pnpm i18n:check
pnpm build
```

## Notes

- Pure re-presentation of the entries `/tab` already loads — no new query, no schema change.
- Breakdown grand total == tab total by construction (same counted predicate).
