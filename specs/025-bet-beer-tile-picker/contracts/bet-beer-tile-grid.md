# Contract: Bet-Beer Tile Grid (inside RecordResultForm)

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The picker is rendered inline inside
`RecordResultForm.tsx` — no new shared component file. The
inline JSX consumes two new props on the form's existing
`RecordResultFormProps`:

## Prop additions

```diff
 interface RecordResultFormProps {
   agreementId: string;
   sideALabel: string;
   sideBLabel: string;
-  betBeerOptions?: Array<{ id: string; name: string }>;
+  /** Catalog beers shown as picker tiles. Undefined when the
+   *  agreement is not for-beer OR the viewer can't record. */
+  betBeerOptions?: Array<{ id: string; name: string }>;
+  /** Recorder's last-beer name, surfaced on the Auto tile.
+   *  Null when the recorder has never logged a beer. */
+  loserLastBeerName?: string | null;
 }
```

## Render conditions

```text
betBeerOptions undefined  → picker hidden entirely (no-op)
betBeerOptions is []      → picker hidden entirely (no tappable choice
                            beyond Auto; the Auto tile alone would be
                            confusing and the server will fail with
                            NO_BEER_IN_STOCK after submit regardless)
betBeerOptions non-empty  → picker visible with:
                              [Auto tile (pre-selected)]
                              [tile per beer in betBeerOptions]
```

## Selection state

```ts
const [betBeerOverrideId, setBetBeerOverrideId] = useState<string | null>(null);
// null = Auto tile selected; any string = that beer-id picked
```

Behavior:

- On render, `betBeerOverrideId === null` (Auto tile selected).
- Tap the Auto tile when a non-Auto is selected → set null.
- Tap the Auto tile when Auto is already selected → no-op.
- Tap a non-Auto tile → set that beer's id.
- Tap a non-Auto tile that's already selected → no-op (the
  selection sticks; the user can switch by tapping a
  different tile or the Auto tile).

## Tile visuals

| Tile | Label | When selected |
|------|-------|---------------|
| Auto | `t('match.betPicker.autoLabel', { beer: loserLastBeerName })` when name present, else `t('match.betPicker.autoFallback')` | `bg-primary text-primary-foreground border-primary` (matches `/log`) |
| Beer-N | `beerName` | same selected style |

Shared classes (per `/log`'s beer tiles): `flex h-16
items-center justify-center rounded-md border px-3 text-base
font-medium transition-colors`. Selected adds the primary
trio; unselected uses `border-input bg-background
hover:bg-accent`.

## Submit translation

```ts
const payload = {
  agreementId,
  winningSide: side,
  ...(betBeerOverrideId ? { betBeerOverrideId } : {}),
};
```

The spread keeps the wire shape identical to today.

## Test obligations

`tests/component/record-result-form.spec.tsx`:

1. **Tile grid renders when betBeerOptions has ≥1 entry** —
   N+1 tile buttons (Auto + N beers) render. Auto is
   pre-selected (visual class).
2. **Auto tile label uses loserLastBeerName when set** —
   passing `loserLastBeerName="Pilsner"` renders
   "Auto · Pilsner" (or the localized equivalent).
3. **Auto tile label uses fallback when loserLastBeerName
   is null** — renders the localized `autoFallback`
   string ("Auto · Pivo" / "Auto · Beer").
4. **Tap non-Auto tile flips selection** — after tapping
   "Stout", the Stout tile is selected and the Auto tile
   is not.
5. **Tap Auto tile after non-Auto pick reselects Auto** —
   selection returns to the Auto state.
6. **Submit with Auto selected omits betBeerOverrideId** —
   mock `recordResultAction`; assert payload does NOT
   contain `betBeerOverrideId`.
7. **Submit with a beer selected includes
   betBeerOverrideId** — mock action; assert payload
   contains `betBeerOverrideId: 'b-stout-id'`.
8. **Picker hidden when betBeerOptions is undefined** —
   the "who won" buttons still render; no picker tiles
   exist.
9. **Picker hidden when betBeerOptions is empty** — same
   as #8 (the existing NO_BEER_IN_STOCK error path on
   submit covers the data layer).

## i18n key changes

| Key | Status |
|-----|--------|
| `match.betPicker.autoLabel` | NEW — params: `{beer}` |
| `match.betPicker.autoFallback` | NEW — no params |
| `match.betPicker.label` | REMOVED |
| `match.betPicker.defaultHint` | REMOVED |
| `match.betPicker.override` | REMOVED |
| `match.betPicker.submitHint` | REMOVED (already orphan in code) |

## Backwards compatibility

The form's existing consumers (the agreement-detail page)
need to pass the new `loserLastBeerName` prop. No external
consumer outside the page.
