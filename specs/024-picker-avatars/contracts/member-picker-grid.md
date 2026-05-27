# Contract: `MemberPickerGrid` (tile shape)

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The tile-shape member picker used on `/log/for`. Renders one
tile per candidate (avatar + display name) in a responsive
grid. Tap-to-select; controlled by a `value`/`onChange` pair.

## Signature

```ts
export interface MemberOption {
  id: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}

interface MemberPickerGridProps {
  members: MemberOption[];
  /** Currently picked member's id; null when nothing picked. */
  value: string | null;
  onChange: (memberId: string | null) => void;
  /** Optional aria-label for the grid container; default
   *  reuses the existing `t('log.onBehalf.memberHint')`. */
  ariaLabel?: string;
  /** Optional className for the outer grid wrapper. */
  className?: string;
}

export function MemberPickerGrid(props: MemberPickerGridProps): JSX.Element;
```

## Behavior

- Each candidate renders as a button-like tile
  (`<button type="button">` so it's keyboard-reachable).
- The picked tile uses the same "selected" visual style as
  the existing beer-tile selected state on `/log/for`:
  `bg-primary text-primary-foreground border-primary`.
- Tapping the already-picked tile clears the selection
  (calls `onChange(null)`). Mirrors the
  `handlePickGlyph(null)` no-op-back-to-null pattern from
  spec 020's avatar picker.
- Empty `members` array renders nothing — callers handle
  the empty state themselves (e.g. `/log/for` already
  shows the "no opponents" message in that case).

## Inner layout per tile

```
┌──────────────────────────────┐
│  [MemberAvatar size="row"]   │
│  Display Name (truncates)    │
└──────────────────────────────┘
```

- Avatar at `size="row"` (h-8 w-8) — slightly larger than
  the in-text inline size, so the tile reads as
  "a member you can tap".
- Name below the avatar, truncated to a single line.
- Tile has a fixed minimum width so the grid stays
  uniform regardless of name length.

## Test obligations

`tests/component/member-picker-grid.spec.tsx`:

1. **Renders one tile per option** — given N candidates,
   renders N buttons; each shows the candidate's
   displayName.
2. **Avatar variant per option** — a candidate with
   `avatarUploadAt` set renders an `<img>` tile; a
   candidate with `avatarKey` renders the glyph SVG; a
   candidate with neither renders the initials chip.
3. **Selection state** — passing `value=X` marks the
   matching tile selected (visual class / aria-pressed);
   other tiles render un-selected.
4. **onChange fires with the picked id on tap** — tapping
   a non-selected tile calls `onChange(id)` with that
   candidate's id.
5. **Tap on already-picked clears selection** — tapping
   the currently-selected tile calls `onChange(null)`.
6. **Empty members renders nothing** — `members=[]`
   produces no tiles (and a smoke check that no
   accessibility errors are raised).
7. **Keyboard accessibility** — tab moves focus tile-to-
   tile; Enter on a focused tile fires onChange.
