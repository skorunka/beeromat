# Quickstart: Picker Avatars

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

Manual walkthrough that verifies the three picker surfaces
after `/speckit-implement` finishes.

## Setup

1. Boot the dev server: `pnpm dev` (or use the `/dev` skill).
2. Sign in to a club with ≥4 active members. Set up a mix:
   - One member with an uploaded photo (`/account` →
     upload form).
   - One member with a picked glyph (`/account` → glyph
     palette).
   - At least one member with neither (initials fallback).
3. Confirm at least one beer is in stock so `/log/for` has
   anything to submit.

## US1 — Tile grid on `/log/for`

Navigate to `/log/for` as a member who has at least one other
active member in the club.

**Expected**:

- The member section above the beer grid is a TILE GRID,
  not a `<select>`.
- Each tile shows the candidate's avatar (size="row",
  h-8 w-8) + their displayName below.
- A tile's selected state matches the beer-tile selected
  state on the same form
  (`bg-primary text-primary-foreground border-primary`).
- Tapping a tile selects it; tapping the same tile again
  deselects (clears the member). Tapping a different
  tile swaps the selection.
- Members with no avatar render their initials chip
  inside the tile — no broken-image artifact.
- After picking a member AND a beer, the existing submit
  button's contextual label updates (matches today's
  copy: "Zapsat {beer} pro {member}").
- Submitting calls `logBeerOnBehalfAction` with the picked
  `targetMemberId` — the on-behalf log lands on the
  chosen member's tab.

## US2 — Dropdown per seat on `/match` new agreement

Navigate to `/match`. Open the "new agreement" flow.

**Expected**:

- The format toggle (singles / doubles) is unchanged.
- After picking the format, 2 or 4 seat controls render
  (depending on format).
- Each seat is an AVATAR DROPDOWN, not a `<select>`.
- Trigger states:
  - Unpicked seat: shows the existing seat placeholder
    (no avatar, just text + chevron).
  - Picked seat: shows the picked member's avatar +
    displayName + chevron. The form-summary reader can
    scan the four triggers and know the lineup.
- Opening a dropdown shows one option per active club
  member. Each option has the member's avatar + name.
- The "—" / clear option at the top of the popup lets
  the user unpick.

## US3 — Duplicate-seat protection on `/match`

With the doubles new-agreement form open:

**Expected**:

- Pick member X for seat A1.
- Open the seat A2 picker → member X is rendered
  disabled (visually de-emphasized, non-clickable).
- Pick member Y for A2 → open the seat A1 picker → now
  member Y is disabled in A1.
- Clear seat A1 (pick "—") → member X becomes selectable
  again in the other seats.
- Switch format from doubles to singles → only 2 seat
  controls remain; out-of-range assignments (B1, B2)
  clear; disable-set recomputes from the remaining
  selections.

## US2 (edit form) — `/match/[id]` edit

Navigate to `/match/[id]` for an existing open agreement
the user can edit.

**Expected**:

- The same avatar-dropdown trigger appears for each seat,
  pre-populated with the currently-assigned member's
  avatar + name.
- Re-selecting (or clearing + re-picking) updates the
  trigger and the form state correctly.
- Submitting saves via the existing match-agreement edit
  action — no contract change.

## Edge / regression checks

- A member with no avatar (Standa-persona) renders
  initials cleanly on every picker surface — no broken
  image icon, no layout shift.
- The "no opponents" empty state on `/log/for` (when the
  caller is the only active member) renders unchanged.
- The home page (`/`), `/tab`, `/history`, `/admin/*`
  surfaces are unchanged — out of scope this spec.
- Keyboard-only navigation works on both shapes:
  - `/log/for` tile grid: tab moves focus tile-to-tile;
    Enter selects.
  - `/match` dropdown: tab to the trigger, Enter or
    Space opens, arrow keys navigate options, Enter
    selects, Esc dismisses.

## Done when

- All three surfaces show avatars on every option /
  tile.
- The submit contracts (`logBeerOnBehalfAction` + match
  agreement create / edit) work unchanged.
- The duplicate-seat protection holds on `/match` new +
  edit.
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm
  test:integration && pnpm test:component && pnpm
  i18n:check && pnpm forms:check && pnpm build` is
  green.
