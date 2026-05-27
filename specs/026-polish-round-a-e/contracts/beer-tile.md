# Contract: `BeerTile` component

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The shared beer-tile primitive used by `/log` (the dedicated
beer-picker page), `/log/for` (on-behalf form), and the
match-result form (bet-beer picker).

## Signature

```ts
export type BeerTileSize = 'card' | 'tile';

export interface BeerTileBeer {
  id: string;
  name: string;
  currentStock: number;
  /** Required for size='card' (renders a price line);
   *  ignored for size='tile' which is name-only. */
  unitPriceMinor?: bigint;
}

interface BeerTileProps {
  beer: BeerTileBeer;
  size: BeerTileSize;
  selected: boolean;
  onClick: () => void;
  /** Optional disabled state — e.g. out-of-stock on /log. */
  disabled?: boolean;
  /** Currency + locale needed only for size='card' to format
   *  the price line. Passed through to formatMoneyCompact. */
  currencyCode?: string;
  locale?: string;
  /** Optional className for spacing nudges. Appended last. */
  className?: string;
}

export function BeerTile(props: BeerTileProps): JSX.Element;
```

## Size variants

| `size` | Wrapper classes | Renders |
|--------|-----------------|---------|
| `card` | `flex h-32 flex-col justify-between p-4` | Beer name (top, font-medium) + price line (bottom, font-mono text-xs, muted). Used by `/log`. |
| `tile` | `flex h-16 items-center justify-center px-3 text-base font-medium` | Beer name only, truncated. Used by `/log/for` + match-result form. |

Both share: `rounded-md border transition-colors`, selected
adds `bg-primary text-primary-foreground border-primary`,
unselected uses `border-input bg-background hover:bg-accent`,
disabled adds `opacity-50 cursor-not-allowed`.

## Behavior

- Renders as `<button type="button">` (keyboard-reachable).
- Click fires `onClick()`. Consumer owns the action state.
- `disabled` short-circuits the click (the button is
  visually + functionally inert).

## Test obligations

`tests/component/beer-tile.spec.tsx`:

1. **Renders name on both variants** — `size='card'` and
   `size='tile'` both show the beer name.
2. **Card variant renders price line** — given `unitPriceMinor`,
   the card shows the formatted price below the name.
3. **Tile variant does NOT render price** — even if
   `unitPriceMinor` is provided, `size='tile'` shows
   name only.
4. **Selected state applies primary trio classes** — given
   `selected=true`, the wrapper has the bg-primary +
   text-primary-foreground + border-primary classes.
5. **Click fires onClick** — clicking the button calls
   `onClick`.
6. **Disabled prevents click + applies opacity-50** —
   `disabled=true` makes the button non-clickable and
   visually dimmed.
