# Research: Bet-Beer Tile Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All decisions resolved before planning. No outstanding
NEEDS CLARIFICATION markers.

## D1 — Visibility default (Clarifications Q1 → A)

**Decision**: Always-visible tile grid above the "who won"
buttons. The collapsed `<details>` disclosure is removed
entirely.

**Rationale**:

- The override is a recurring choice, not a rare advanced
  setting. Every match settlement is an opportunity to pick a
  beer; hiding the picker behind a disclosure trained users
  to ignore it.
- Visual harmony with the rest of the app: `/log`,
  `/log/for`, the avatar grid on `/account`, the new picker
  components from spec 024 — none collapse. The match-result
  form was the lone holdout.

**Alternatives considered**:

- **Option B — keep collapsed, swap inner control to tiles**:
  Rejected. Solves the off-pattern look without solving the
  discoverability tax. The point of the change is for the
  user to SEE the choice.
- **Option C — smart-visible (expand on second visit via
  localStorage)**: Rejected for scope. Solvable but more
  code; deferrable.

## D2 — Default-tile presentation (Clarifications Q2 → α)

**Decision**: Include an "Auto · {loserLastBeerName}" tile
as the first cell in the grid, pre-selected. Label format:

- Loser has a last-beer → "Auto · Pilsner"
- Loser has no last-beer → "Auto · Pivo" (cs) / "Auto · Beer" (en)

Tapping the Auto tile is the "use server default" signal
(no `betBeerOverrideId` in the payload). Tapping any non-Auto
tile selects that beer + sends it as the override.

**Rationale**:

- Showing what the default WILL BE removes the user's mental
  step of "wait, what gets sent if I don't pick anything?"
- The pre-selected state matches the existing form's behavior
  (today an empty-string `<option>` is selected on render).
- The fallback label is needed because some recorders are
  brand-new members who have never logged a beer; without
  the fallback the Auto tile would read "Auto · " with no
  beer name.

**Alternatives considered**:

- **Option β — no Auto tile, empty grid means "use auto"**:
  Rejected. Less discoverable; user can't see what gets sent
  when they don't pick. The current `<select>` works this
  way and is precisely the problem we're fixing.

## D3 — Beer source (Clarifications Q3 → ⅰ)

**Decision**: Keep the existing `betBeerOptions` query —
all active in-stock beers from the club catalog.

**Rationale**:

- Matches `/log`'s source of truth.
- No new query, no new edge cases.
- The "recent beers" alternative would solve a different
  problem (relevance ranking) that isn't part of this spec.

**Alternatives considered**:

- **Option ⅱ — loser's 5 most-recent distinct beer types**:
  Rejected. Requires a new query, handles a tail edge case
  (recorder is new and has no recent beers), and is
  arguably less correct (the picker is a betting choice,
  not a "what does the loser usually drink" suggestion).

## D4 — Auto tile = "no override" wire-state

**Decision**: The picker's selection state is `string | null`
where `null` means "Auto" (no override). On submit:

- `state === null` → action payload omits `betBeerOverrideId`
  (or sends it explicitly as undefined).
- `state === <beer-id>` → payload sends
  `betBeerOverrideId: <beer-id>`.

**Rationale**: Matches today's wire semantics exactly. The
existing form submits `...(betBeerOverrideId ? { betBeerOverrideId } : {})`
which spreads the field only when truthy. Reusing this
keeps the server contract unchanged and the existing
integration tests valid.

**Alternatives considered**:

- **Always send `betBeerOverrideId`, with `null` meaning
  auto**: Rejected. The server's action schema currently
  treats absence as "no override"; changing this is a
  contract change that pulls in the action + the integration
  tests.

## D5 — Where the Auto label's `loserLastBeerName` comes from

**Decision**: The page (server component) fetches the
recorder's last-beer name via the existing
`lastBeerForMember(memberId, clubId)` query in
`lib/db/queries/consumption.ts`, runs it inside the same
`Promise.all` that already loads `betBeerOptions` +
`agreement` + `members`. The recorder is `ctx.member.id`
(loaded by `requireUnlocked`); for the at-rest case the
recorder is one of the players, and the Auto label
reflects THEIR last-beer.

**Caveat**: at the moment of recording, the recorder
hasn't picked which side won yet — so "the loser" hasn't
been determined. The Auto label shows the recorder's
last-beer in all cases. If the recorder ends up being the
WINNER (they tap their own side won), the server's
auto-default still resolves to the actual loser's
last-beer (server behavior unchanged by this spec).

So: the Auto tile label is a UI HINT showing what the
default would be in the recorder-is-loser case (the most
common case — recorders typically settle from their own
phone, on the losing side). The actual server-side
resolution may differ in the recorder-is-winner case;
that's an acceptable hint-vs-truth gap noted in
`spec.md` Assumptions.

**Rationale**: Computing the actual loser's last-beer
requires knowing which side won, which is a post-tap
decision. Showing the recorder's last-beer at-rest is the
right approximation 95% of the time and avoids a
JS-derived "two possible defaults, one per side" UI that
would over-engineer the affordance.

**Alternatives considered**:

- **Show both side-A-last-beer + side-B-last-beer** on two
  separate Auto tiles: Rejected. Doubles the cognitive
  load on the picker for a marginal correctness win.
- **Update the Auto tile label reactively when the user
  hovers/taps a side button**: Rejected. The side buttons
  are the SUBMIT — there's no "preview" mode between
  hover and commit. Adding one is a redesign.
- **Show "Auto · ?"** with no name: Rejected. Loses the
  whole UX point (the user not seeing what the default
  is) that this spec is solving.

## D6 — i18n key churn

**Decision**: Add `match.betPicker.autoLabel` (parameterized
on `{beer}`) and `match.betPicker.autoFallback` (no params).
Remove the four existing keys that become unused:
`match.betPicker.label`, `defaultHint`, `override`,
`submitHint`. The `i18n:check` gate enforces parity, so
catalog drift surfaces immediately.

**Rationale**: Dead keys rot. The four obsolete keys only
exist for the collapsed picker UI that this spec removes;
keeping them around invites confusion in a future
translation pass.

**Alternatives considered**:

- **Keep the four obsolete keys for forward compat**:
  Rejected. Forward compat for what? Nothing else consumes
  them. The catalogs should reflect what the app actually
  uses.

## D7 — Component test strategy

**Decision**: One new component spec
(`tests/component/record-result-form.spec.tsx`) covers:

1. Picker renders when `betBeerOptions` is non-empty.
2. Auto tile renders first + is pre-selected.
3. Tapping a non-Auto tile flips selection and unselects
   Auto.
4. Tapping the Auto tile after a non-Auto pick deselects
   the non-Auto and reselects Auto.
5. Submitting "Side A won" with Auto selected calls
   `recordResultAction` with NO `betBeerOverrideId`.
6. Submitting "Side A won" with a non-Auto tile selected
   calls `recordResultAction` WITH the picked
   `betBeerOverrideId`.
7. Picker hidden when `betBeerOptions` is undefined
   (not-for-beer or not-authorized state).
8. Auto fallback label renders when `loserLastBeerName` is
   null.

**Rationale**: This form has interactive state worth
guarding — the wire-state translation between "Auto = null"
and "non-Auto = id" is a real failure mode worth testing.

**Alternatives considered**:

- **No new tests, rely on manual walkthrough**: Rejected.
  The translation between picker state and wire payload is
  precisely the regressable surface; manual testing
  doesn't scale across the future polish passes that will
  inevitably touch this file.
