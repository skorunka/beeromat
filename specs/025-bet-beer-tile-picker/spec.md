# Feature Specification: Bet-Beer Tile Picker

**Feature Branch**: `025-bet-beer-tile-picker`

**Created**: 2026-05-27

**Status**: Shipped (2026-05-27)

**Input**: User description: replace the collapsed `<details>`
+ native `<select>` bet-beer override on the match-result
form with a tile-grid picker matching `/log`'s beer tiles.
Brings the override up to the same visibility + tactile feel
as the rest of the app's beer selection. The data side
(`betBeerOverrideId` in the recordResult action payload) was
shipped with spec 018 and is unchanged.

## Clarifications

### Session 2026-05-27

Three design questions resolved (all recommended defaults
confirmed by user) before planning:

- **Q1 — Visibility default**: ALWAYS-VISIBLE tile grid above
  the "who won" buttons (Option A). The override stops being
  a hidden advanced setting; every recorder sees the picker
  and chooses or accepts the default. Matches `/log`,
  `/log/for`, the avatar grid on `/account` — none collapse.
- **Q2 — Default-tile presentation**: include a "use default
  beer" TILE at the start of the grid, pre-selected (Option α).
  Its label says "Auto · {loserLastBeerName}" so the recorder
  sees WHAT the default will be without thinking. Falls back
  to a generic "Auto · Pivo" / "Auto · Beer" label when the
  loser has no last-beer (new member who has never logged).
- **Q3 — Beer source**: KEEP the existing source — all
  in-stock active beers across the club catalog (Option ⅰ).
  Matches `/log`'s source; no new query.

## User Scenarios & Testing

### User Story 1 — Tap-to-pick bet beer on match settle (Priority: P1)

Tereza is recording the result of a Wednesday doubles match
her side just lost. The match-result page shows a tile grid:
"Auto · Pilsner" (her last-beer, pre-selected) followed by
tiles for every other in-stock beer in the club catalog. She
taps "Stout" because Pavel asked for one, then taps "Side A
won" — the loser-pays-winner-a-stout transfer lands on Pavel's
tab. Two taps, no expand-the-collapsible step.

**Why this priority**: This is the value-prop of the whole
spec. Today's `<details>` + `<select>` is hidden + off-pattern;
recorders rarely override because they don't notice the
control. Bringing the picker up to the standard tile grid
removes the discoverability tax.

**Independent Test**: Seed an open for-beer doubles agreement
where the recorder's last-beer is "Pilsner" and the club
catalog has at least one other in-stock beer "Stout". Open
the agreement detail page → confirm the tile grid renders
with "Auto · Pilsner" first (pre-selected) and "Stout" as
a second tile. Tap "Stout" → tap "Side A won" → confirm the
resulting bet transfer carries beerTypeId = stout.

**Acceptance Scenarios**:

1. **Given** the recorder has a last-beer "Pilsner" AND the
   catalog has at least one other in-stock beer "Stout",
   **When** the recorder opens the match-result page,
   **Then** a tile grid renders with "Auto · Pilsner"
   pre-selected and "Stout" as a sibling tile.
2. **Given** the grid is rendered, **When** the recorder
   taps the "Stout" tile, **Then** the "Stout" tile becomes
   visually selected and the "Auto · …" tile deselects.
3. **Given** the recorder has tapped "Stout" and now taps
   "Side A won", **When** the `recordResultAction` runs,
   **Then** the payload carries `betBeerOverrideId = stout`
   and the resulting bet transfer's beer is "Stout".

---

### User Story 2 — Default works for the average match (Priority: P2)

Pavel is recording a match and doesn't care which specific
beer goes on the winner's tab. The "Auto · {his-last-beer}"
tile is pre-selected; he taps "Side B won" without touching
the picker. The action runs with no override, server falls
back to the loser's last-beer (today's behavior, unchanged).

**Why this priority**: This is the most common path
(~80% of matches per Pavel's usage pattern). The default
tile reduces ceremony — the recorder doesn't have to
think about which beer.

**Independent Test**: Seed the same agreement as US1. Don't
tap any picker tile. Tap "Side A won" → confirm the
`recordResultAction` payload does NOT carry
`betBeerOverrideId` (the empty/null state means "use auto").
Confirm the resulting bet transfer's beer is whatever the
server resolves as the loser's last-beer.

**Acceptance Scenarios**:

1. **Given** the match-result page is open with the
   "Auto · …" tile pre-selected and no other tile tapped,
   **When** the recorder taps "Side A won", **Then** the
   action payload omits `betBeerOverrideId` (or sends it
   as null/empty) and the server-side auto-default kicks in.
2. **Given** the recorder has tapped a non-default tile
   then tapped the "Auto · …" tile again, **When** the
   recorder taps "Side A won", **Then** the payload again
   omits the override.

---

### User Story 3 — Out-of-stock and archived beers stay hidden (Priority: P3)

The picker's source query (`betBeerOptions`) already filters
by `currentStock > 0 AND isArchived = false`. This spec
verifies no archived / zero-stock beer ever appears as a
tappable tile.

**Why this priority**: Verification only. The catalog
filtering already exists; this spec doesn't change it.
Important to flag explicitly so a future refactor doesn't
silently regress.

**Independent Test**: Seed the catalog with three beers — one
in-stock active, one out-of-stock active, one archived.
Confirm the tile grid renders only the in-stock active one
(plus the "Auto · …" default tile).

**Acceptance Scenarios**:

1. **Given** the club catalog has an out-of-stock active
   beer "EmptyKeg" (currentStock = 0) and an archived beer
   "Discontinued", **When** the recorder opens the
   match-result page, **Then** neither "EmptyKeg" nor
   "Discontinued" appears as a tile.

---

### Edge Cases

- **Loser has no last-beer** (e.g. brand-new member who has
  never logged a beer). The "Auto · …" tile renders with
  a generic "Auto · Pivo" / "Auto · Beer" label (no beer
  name appended). Tapping it still sends "no override"; the
  server's existing `NO_BEER_IN_STOCK` error path handles
  the actual settlement failure if the loser also has no
  catalog match — out of scope here.
- **The default beer is also separately listed in the
  catalog**. The "Auto · …" tile and the per-beer tile for
  the same beer are visually distinct (the Auto tile has
  the "Auto · " prefix). Tapping the per-beer tile sends
  the override explicitly; tapping the Auto tile sends no
  override. Both produce the same server-side result when
  the default IS that beer, but the wire payload differs.
- **Catalog has zero in-stock beers**. The picker renders
  only the "Auto · …" tile (no other options). The action's
  existing `NO_BEER_IN_STOCK` path is what surfaces the
  problem after submit — the picker doesn't need to
  pre-empt it.
- **Recorder picks "Stout", then closes and reopens the
  page**. Picker state resets — the override doesn't
  persist across navigations (it's pre-submit form state).
- **Long beer-name truncation**: a beer name like
  "Pivovar Kout na Šumavě 12°" must fit a tile without
  overflow. Reuse the existing `truncate` styling on the
  `/log` beer tiles.

## Requirements

### Functional Requirements

- **FR-001**: System MUST render a tile grid above the
  "who won" buttons on the match-result form when the
  agreement is for-beer AND the viewer is authorized to
  record the result. Tile layout matches `/log`'s beer
  grid (h-16 px-3, selected style `bg-primary
  text-primary-foreground border-primary`).
- **FR-002**: System MUST include an "Auto · {loserLastBeer}"
  tile as the first tile in the grid, pre-selected on first
  render. Its label MUST include the loser's last-beer name
  when available, OR a generic localized "Pivo" / "Beer"
  fallback when the loser has no last-beer.
- **FR-003**: System MUST list one tile per in-stock active
  beer from the club catalog after the Auto tile. Source
  data unchanged from today's `betBeerOptions` query.
- **FR-004**: Tapping a non-Auto tile MUST mark it selected
  and deselect any other selection. Tapping a selected
  non-Auto tile MUST snap selection back to the Auto tile
  (it's the implicit "no override" state).
- **FR-005**: Submitting "Side X won" MUST send
  `betBeerOverrideId = <picked-beer-id>` when a non-Auto
  tile is selected, AND MUST omit/null `betBeerOverrideId`
  when the Auto tile is selected. Server contract is
  unchanged.
- **FR-006**: The `<details>` + native `<select>` from
  today's implementation MUST be removed entirely (no
  collapsed override remains on the form).
- **FR-007**: Out-of-stock or archived beers MUST NOT appear
  as tiles. The existing `currentStock > 0 AND
  isArchived = false` filter on `betBeerOptions` enforces
  this — verification, not a new requirement.
- **FR-008**: The picker MUST NOT render at all when the
  agreement is not for-beer OR when the viewer is not
  authorized to record (the existing `viewerCanRecord`
  gate is preserved).
- **FR-009**: Long beer names MUST truncate visually inside
  the tile (matches `/log`'s tile behavior — no overflow).
- **FR-010**: The 5-minute reverse window on the result
  (existing `reverseResultAction`) MUST work unchanged
  whether or not an override was used.

### Key Entities

- **Bet-beer picker tile**: A UI cell representing one
  selectable choice — either the Auto default (one per
  picker render) or a specific in-stock catalog beer
  (one tile per active in-stock beer).
- **Picker selection state**: A UI-local piece of form
  state holding either the picked beer's id or the "Auto"
  sentinel. Already exists as `betBeerOverrideId: string`
  in the form; this spec only changes the visual surface
  that reads/writes it.
- **No new persistent entities**: The `betBeerOverrideId`
  field on the `recordResult` action payload (spec 018) is
  reused unchanged.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The bet-beer picker renders as an always-
  visible tile grid (no `<details>` disclosure required to
  see the options) on every match-result form for an open
  for-beer agreement — verified by a manual walkthrough.
- **SC-002**: The "Auto · …" tile is pre-selected on first
  render with the loser's last-beer name surfaced (or the
  localized generic "Pivo" / "Beer" fallback). Verified by
  component tests covering both populated + null
  last-beer cases.
- **SC-003**: Tapping a non-Auto tile then submitting "Side X
  won" sends the chosen beer as `betBeerOverrideId` in the
  action payload. Tapping the Auto tile (or never touching
  the picker) sends no override. Verified by component-level
  smoke tests covering both submit paths.
- **SC-004**: The native `<select>` + the surrounding
  `<details>` are gone from `RecordResultForm.tsx` after
  this spec — no other consumer of `betBeerOptions` exists.
- **SC-005**: No regression on the match-settle journey —
  existing integration tests for `recordResultTx` /
  `reverseResultAction` continue to pass (data contract
  unchanged).
- **SC-006**: Tile UI on a 360-wide phone fits two tiles per
  row at the existing `/log` grid spec (grid-cols-2 gap-2);
  long beer names truncate cleanly without breaking the row.

## Assumptions

- The `betBeerOptions` source query in
  `app/[locale]/(app)/match/[agreementId]/page.tsx` (lines
  54-67) already returns the right shape (`{ id, name }`)
  and the right filter (in-stock + active). This spec extends
  the page's call to also pull the recorder's last-beer name
  for the Auto tile label.
- A small helper to find "the loser's last-beer name" is
  reachable server-side via the existing `lastBeerForMember`
  query (`lib/db/queries/consumption.ts`). The recorder IS
  the loser in the at-rest case for a doubles match (the
  recorder is on one of the sides; whichever side they
  click as the winner determines their loser-or-winner
  status — but at-rest the auto-default falls back to the
  recorder's last-beer).
- "Auto · {beer}" label localization needs two new i18n
  keys: `match.betPicker.autoLabel` and
  `match.betPicker.autoFallback` (Czech: "Auto · {beer}" /
  "Auto · Pivo"; English: "Auto · {beer}" / "Auto · Beer").
  Existing keys `match.betPicker.override`,
  `match.betPicker.label`, `match.betPicker.defaultHint`
  may be removed (the `<details>` is gone) — verify catalog
  parity after the swap.
- The existing component-level test for
  `RecordResultForm.tsx` (if any) needs to be updated to
  cover the new tile-grid. If none exists, this spec adds
  one.
- Performance: no new data fetch. The page already runs the
  `betBeerOptions` query in parallel with the rest of the
  page load. Adding a `lastBeerForMember` call adds one
  more query in the same `Promise.all`.
- Picker is pre-submit UI state — no need for revalidation
  on selection change.
