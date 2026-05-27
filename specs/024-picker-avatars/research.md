# Research: Picker Avatars

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All decisions resolved before planning. No outstanding
NEEDS CLARIFICATION markers.

## D1 — Picker shape per surface (Clarifications Q1 → A)

**Decision**: Two distinct shapes — `MemberPickerGrid`
(tile-grid, used on `/log/for`) and `MemberPickerDropdown`
(custom dropdown trigger + popup, used per seat on `/match`
new + edit).

**Rationale**:

- `/log/for` already renders a tile grid for the beer side
  of the form. Using a tile grid for the member side too
  creates visual harmony (one selection idiom per screen)
  and makes the screen scan as "pick this, then pick that"
  without forcing the user to switch mental models
  mid-form.
- `/match` seat assignment puts 4 controls vertically. A
  tile grid per control would mean 4 × ~30 candidate tiles
  on one screen — too much. A compact dropdown per seat
  keeps the form scrollable on a 360-wide phone while still
  showing each candidate's avatar inside the open popup.

**Alternatives considered**:

- **Unified dropdown everywhere (Option B)**: Rejected.
  Loses the `/log/for` tile harmony; introduces a third
  selection idiom on a screen that already has a tile grid
  (the beer side).
- **Unified tile grid everywhere (Option C)**: Rejected.
  Would consume excessive vertical space on `/match` (4
  seats × full member roster). Phones have a finite
  scrollable surface; multi-grid layouts on a form make
  validation errors and the submit button hard to reach.

## D2 — Duplicate-seat protection (Clarifications Q2 → α)

**Decision**: The `/match` seat dropdowns disable candidates
already assigned to another seat in the same agreement form.
The disable set is computed from current form state
(react-hook-form's `watch()` on the seat fields) and passed
into each picker as a prop.

**Rationale**:

- Prevents a real bug today's native `<select>` allows.
- Disabling (rather than omitting) keeps the option visible
  but inactive — clearer feedback than "the member silently
  vanished from one of my pickers".
- The server-side validator that rejects duplicate seats on
  submit remains as a belt-and-braces guard. If the UI
  state ever drifts (e.g. race during a slow re-render),
  the server still refuses.

**Alternatives considered**:

- **Omit (rather than disable)** already-assigned
  candidates: Defensible — a smaller candidate list reads
  faster. But disabling preserves the "I know X is in this
  agreement somewhere" signal. We chose disable.
- **No UI protection (Option β)**: Rejected. Server-only
  guarding means the user discovers the dup-seat constraint
  by failing to submit, which is a worse experience than
  a visibly-disabled option.

## D3 — Filter-as-you-type (Clarifications Q3 → ⅰ)

**Decision**: No filter input. Candidates scroll inside the
dropdown popup; keyboard nav (arrow keys + type-ahead
provided by the base-ui Menu primitive natively) covers
fast access for clubs at typical scale (~30 members).

**Rationale**:

- Adding a filter input means trapping focus inside the
  popup, managing two interaction modes (typing vs.
  navigating), and a screen-reader announcement strategy
  for the filtered count. Each is solvable but is
  out-of-proportion for a ~30-member club where scrolling
  is fine.
- Spec is explicit about preserving room for filter as a
  future spec if a larger-club case emerges.

**Alternatives considered**:

- **Add a filter input now (Option ⅱ)**: Rejected for
  scope. Easy to add in a follow-up spec if a club at 50+
  members hits us — same `MemberPickerDropdown` API can
  grow a `filterable?: boolean` prop without breaking
  callers.

## D4 — Where the new components live

**Decision**: A new `components/picker/` directory holds
`member-picker-grid.tsx` and `member-picker-dropdown.tsx`.
They depend on `MemberAvatar` from `components/ui/` but
serve a distinct, higher-level concern (form-state-aware
member selection); placing them under `components/ui/`
would conflate primitive UI parts with form-flow
components.

**Rationale**: Matches the existing convention — area-
specific shared components live under `components/<area>/`
(e.g. `components/admin/`, `components/treasurer/`,
`components/bet/`). `components/picker/` is a new area
because the two pickers are reused across two unrelated
features (log + match).

**Alternatives considered**:

- Place the two pickers under `components/log/` and
  `components/match/` respectively: Rejected. They share
  the same MemberAvatar wrapping logic + the same
  member-option shape — keeping them co-located makes
  refactoring (e.g. when filter-as-you-type lands) easier.

## D5 — Member-list query extension pattern

**Decision**: Two queries get the avatar field projection:

1. `listActiveClubMembers` in `lib/db/queries/match-
   agreements.ts` — already exists, extend the SELECT.
2. The inline member query in `app/[locale]/(app)/log/for/
   page.tsx` — extract into a testable helper
   `listOtherActiveMembers(clubId, excludingMemberId)` in
   a new `lib/db/queries/members.ts` module (or extend an
   existing one). Easier to write an integration test
   against a named export than against an inline query.

**Rationale**: Extracting the `/log/for` query removes the
duplication between the page-level filter and a future
caller of the same pattern. Both queries return the same
`{ id, displayName, avatarKey, avatarUploadAt }` shape so a
single component option type covers both surfaces.

**Alternatives considered**:

- Leave `/log/for`'s query inline + assert on the rendered
  picker tile in a component test: Rejected. Less direct;
  shape-drift would surface as a rendering bug rather than
  a typed-query failure.

## D6 — DropdownMenu primitive vs. building from scratch

**Decision**: Reuse the existing `DropdownMenu` from
`components/ui/dropdown-menu.tsx` (base-ui's `@base-ui/react/
menu`). Already in use on the admin kebab + the user-menu
language switcher (RadioGroup + RadioItem pattern).

**Rationale**: Already in the dependency tree; already
maintained by the same conventions as other menus in the
app; keyboard nav + ARIA semantics handled.

**Alternatives considered**:

- Build a custom Listbox from raw HTML: Rejected. Re-
  inventing keyboard nav + a11y semantics on a small app
  is a waste of effort.
- Add a new `Combobox` from a different library: Rejected
  by the spec's `feedback-no-patching-externals` adjacent
  principle (don't add dependencies when an existing one
  fits).

## D7 — Trigger button design for the `/match` dropdown

**Decision**: Each seat's dropdown trigger renders one of
two states:

- **Unpicked**: a neutral pill with the existing localized
  placeholder text (`t('seatPlaceholder')` or whatever the
  current `<option value="">` label is). No avatar.
- **Picked**: the chosen member's `<MemberAvatar size="row"
  />` + their displayName + a small chevron-down to signal
  "this is a dropdown".

**Rationale**: The picked-state trigger doubles as the form
preview — the agreement-form scanner reads four trigger
avatars and immediately knows the lineup without expanding
any picker. Matches the picture-of-the-form principle.

**Alternatives considered**:

- Trigger always renders just the name + chevron, regardless
  of picked state: Rejected. The avatar is precisely the
  recognition cue the spec is asking for; hiding it after
  selection wastes the affordance.

## D8 — Reactive disable-set in react-hook-form

**Decision**: Use `useWatch({ control, name: ['a1', 'a2',
'b1', 'b2'] })` (or the corresponding seat field array) to
get the live values of every seat field. Compute the
"already-assigned IDs" set from those values, then pass it
as `disabledIds` to each seat's `MemberPickerDropdown` (the
picker excludes its own current value from the disabled
set so re-picking the same member doesn't gray itself out).

**Rationale**: `useWatch` re-renders on field changes
without per-render `.watch()` calls (which the project's
lint rule `react-hooks/incompatible-library` already
flags in another file). Component re-renders on every
keystroke into other fields, which is the desired
behavior for the disable-set.

**Alternatives considered**:

- Subscribe via `watch(callback)`: Rejected. Lint warning
  already noted in the file
  (`tests/integration/void-on-behalf-authz.spec.ts` adjacent
  pattern); the imperative subscription is harder to
  reason about than `useWatch`.
- Pass the whole form state down: Rejected. The picker
  shouldn't know the form's shape; it just needs a set
  of IDs to grey out.

## D9 — Test scope

**Decision**: Integration tests cover the two extended
member-list queries (each verifies the new avatar fields
land in result rows). Component tests cover (a) the
`MemberPickerGrid` tile shape, (b) the
`MemberPickerDropdown` shape including the `disabledIds`
behavior, and (c) a wiring smoke test on
`LogOnBehalfForm` so the swap doesn't silently break the
form submit.

**Rationale**: Same logic as spec 023 — query-shape drift
is the silent failure mode worth guarding against; the
component primitives are the leverage point worth testing
in isolation. The wiring test catches the dumb mistake of
hooking the new picker up wrong while still keeping the
test suite small.

**Alternatives considered**:

- One mega-test per surface: Rejected. Test-per-concern
  scales better with future changes.
- Skip the wiring test: Rejected. The /log/for form has
  enough conditional state (canSubmit, contextual submit
  label) that swapping the member control without a smoke
  test is risky.
