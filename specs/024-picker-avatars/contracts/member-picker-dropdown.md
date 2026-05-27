# Contract: `MemberPickerDropdown` (seat shape)

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The dropdown-shape member picker used per seat on the
`/match` new-agreement form and the `/match/[id]` edit
form. Built on the existing `DropdownMenu` primitive (base-ui
`@base-ui/react/menu`).

## Signature

```ts
import type { MemberOption } from './member-picker-grid';
// ↑ same MemberOption shape — both pickers consume the
//   same `{ id, displayName, avatarKey, avatarUploadAt }`.

interface MemberPickerDropdownProps {
  members: MemberOption[];
  /** Currently picked member's id; null when nothing picked. */
  value: string | null;
  onChange: (memberId: string | null) => void;
  /** Optional set of member ids that should render as
   *  disabled in the option list (already-assigned to
   *  another seat in the same agreement). The current
   *  `value` is automatically excluded from the disable
   *  effect so re-selecting the same option works. */
  disabledIds?: Set<string>;
  /** Localized placeholder rendered on the trigger when
   *  `value === null` (reuse existing seat-placeholder copy). */
  placeholder: string;
  /** Aria-label for the trigger button (reuse existing
   *  seat-label copy, e.g. "Side A, position 1"). */
  ariaLabel: string;
  /** Optional className for the trigger button. */
  className?: string;
}

export function MemberPickerDropdown(props: MemberPickerDropdownProps): JSX.Element;
```

## Trigger states

| State | Renders |
|-------|---------|
| Unpicked (`value === null`) | Neutral pill + `placeholder` text + chevron-down icon. No avatar. |
| Picked | `<MemberAvatar size="row" />` + picked member's `displayName` + chevron-down icon. Picked-state trigger lets the agreement-form reader scan the lineup at a glance. |

## Popup contents

- Renders one option per member in `members`.
- Each option row contains: `<MemberAvatar size="inline">` +
  `displayName`. The avatar is the leftmost element.
- An option whose `id` is in `disabledIds` (AND is NOT the
  current `value`) renders disabled — non-selectable,
  visually de-emphasized (opacity reduction matching the
  app's existing disabled-button style).
- A "clear" option at the top of the list lets the user
  unpick — fires `onChange(null)`. Localized as a single
  em-dash "—" (matches today's native `<select>`
  `<option value="">—</option>`).

## Behavior

- Opening the dropdown reuses the base-ui Menu primitive's
  default open/close behavior + arrow-key navigation +
  type-ahead.
- Selecting an option closes the popup and fires
  `onChange(id)`. Selecting the "clear" option fires
  `onChange(null)`.
- The popup positions to bottom-start by default;
  base-ui flips it upward when near the viewport bottom
  (the primitive handles this).

## Test obligations

`tests/component/member-picker-dropdown.spec.tsx`:

1. **Trigger renders placeholder when unpicked** — given
   `value=null`, the trigger button contains the
   `placeholder` text and no avatar.
2. **Trigger renders avatar + name when picked** — given
   `value=X`, the trigger button contains an avatar element
   and the matching member's displayName.
3. **Popup renders all options** — opening the dropdown
   shows one option per member in `members`.
4. **Option avatar variant** — each option shows the
   correct MemberAvatar variant (img / glyph / initials).
5. **onChange fires with picked id** — clicking an option
   fires `onChange(id)`.
6. **Clear option fires onChange(null)** — clicking the
   top "—" option fires `onChange(null)`.
7. **disabledIds disables matching options** — given
   `disabledIds={'m-2'}`, the option for `m-2` renders as
   non-interactive; clicking it does NOT fire onChange.
8. **Current value is NOT disabled even if in disabledIds**
   — passing `value='m-2'` and `disabledIds={'m-2'}` leaves
   that option clickable so re-selection works (no-op
   change but UX-clear).
9. **Keyboard accessibility** — arrow keys navigate
   options; Enter selects; Escape dismisses.
