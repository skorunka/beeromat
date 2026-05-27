# Feature Specification: Post-Shipping Polish Round (A-E)

**Feature Branch**: `026-polish-round-a-e`

**Created**: 2026-05-27

**Status**: Shipped (2026-05-27)

**Input**: Five polish items (A-E) surfaced by a fresh-eyes
code audit after specs 022 + 023 + 024 + 025 shipped today.
Bundled into one spec per user direction "do all a-e". Each
item is a small follow-up that makes the four shipped specs
feel cohesive end-to-end.

**Scope corrections (path-pinning, 2026-05-27)**:

1. **Item D dropped**: `/settle` page does not render the
   treasurer's name anywhere. Audit invented it.

2. **Item A reframed**: the `/log` beer-grid is NOT a simple
   tile — it's a richer h-32 Card carrying low-stock badges +
   "X left" stock count + a 2-3 column responsive grid.
   Different affordances than the h-16 tile pattern; forcing
   them through one component would either bloat it or
   create a single-consumer "BeerCard" (YAGNI). /log keeps
   its rich BeerCard unchanged.

   Revised item C accordingly: `BeerTile` is a single h-16
   shape (no size variant) shared by the two genuine
   tile-pattern consumers (`log-on-behalf-form.tsx` +
   `RecordResultForm.tsx`).

Final scope: **C + B + E** (3 items).

## Clarifications

### Session 2026-05-27

Three design questions resolved with the recommended defaults
(user has consistently confirmed recommended in this session's
prior clarify passes; recorded here for traceability):

- **Q1 — BeerTile size strategy**: TWO SIZE VARIANTS on the
  new `BeerTile` component (Option A). `size='card'` (h-32
  with price line) for `/log` — the dedicated beer-picking
  page where extra height is breathing room. `size='tile'`
  (h-16 flush, name only) for the integrated pickers on
  `/log/for` + the match-result form, where the beer pick
  is one element on a multi-element screen.
- **Q2 — Home one-tap dropdown handling**: KEEP the dropdown
  as-is (Option α). Pure verification: the home button is
  vertically constrained and the dropdown is the right shape
  for that surface. Add a code comment explaining the
  intentional difference so future audits don't re-flag it.
- **Q3 — BeerTile location**: `components/log/beer-tile.tsx`
  (Option ⅰ). Adjacent to its existing consumers; not
  over-promoted to `components/ui/`.

## User Scenarios & Testing

### User Story 1 — Consistent beer tiles across all surfaces (Priority: P1)

Pavel uses `/log` daily for his one-tap log; he also uses
`/log/for` (when fetching for an absent member) and the
match-result form (when settling a match). Today the three
beer pickers look like three different controls. After
this spec, they share one `BeerTile` primitive with two
size variants — the visual language is unified, and a
future polish pass touches one file instead of three.

**Why this priority**: This is the spec's biggest cohesion
win. Three surfaces with the same affordance (pick a beer)
should LOOK like they share a pattern. The DRY win means
the next time we change the tile's selected-state or hover,
we change it once.

**Independent Test**: Render `/log`, `/log/for`, and an
open for-beer agreement detail page. Confirm the beer
tiles on `/log` are h-32 cards with a price line; the
beer tiles on `/log/for` and the match-result form are
h-16 flush tiles. All three use the same selected-state
styling (`bg-primary text-primary-foreground border-primary`).
Existing component tests for the three surfaces continue
to pass.

**Acceptance Scenarios**:

1. **Given** the catalog has two in-stock active beers,
   **When** the user opens `/log`, **Then** each beer
   renders as a `BeerTile size='card'` (h-32, includes the
   formatted price below the name).
2. **Given** the same catalog state, **When** the user
   opens `/log/for`, **Then** each beer renders as a
   `BeerTile size='tile'` (h-16, name only, no price line).
3. **Given** an open for-beer agreement where the viewer
   can record, **When** the page loads, **Then** the
   bet-beer picker renders the Auto tile + one
   `BeerTile size='tile'` per beer in the same row layout
   as today (spec 025).
4. **Given** any of the three surfaces, **When** the user
   taps a beer tile, **Then** the selected-state styling
   matches across surfaces (same primary trio classes).
5. **Given** any of the three surfaces, **When** a beer
   is out of stock or archived, **Then** the existing
   filtering keeps it out of the picker (no regression).

---

### User Story 2 — Logger avatar on the home on-behalf review banner (Priority: P1)

Tereza opens home; Pavel logged a beer on her behalf 5
minutes ago. The home banner reads "Pavel logged a Pilsner
for you" and now shows Pavel's avatar inline before his
name — matching the spec 023 treatment on every other
on-behalf surface.

**Why this priority**: This is a spec 023 gap. Every other
on-behalf surface in the app (the `/tab` "od X" subtitle
from spec 023; the absent member's review affordance) now
shows the logger's face except this banner. Closing the
gap restores the consistency promise.

**Independent Test**: Seed an on-behalf consumption where
the logger has a photo. Open home as the consumer. Confirm
the banner renders Pavel's `<img>` avatar (size="inline")
inline with the existing message text. The banner's
existing Vrátit / Nechat buttons continue to work.

**Acceptance Scenarios**:

1. **Given** an on-behalf consumption logged on the home
   viewer's tab by a member with an uploaded photo,
   **When** home loads, **Then** the banner shows the
   logger's photo avatar inline with the logger name.
2. **Given** the logger has a glyph avatar instead,
   **When** home loads, **Then** the glyph renders inline
   in the same slot.
3. **Given** the logger has no avatar set, **When** home
   loads, **Then** the initials chip renders inline — no
   broken image, no layout shift.
4. **Given** the banner's existing Vrátit / Nechat
   actions, **When** the user taps either, **Then** the
   action contracts are unchanged.

---

### User Story 3 — Home one-tap dropdown stays as-is (Priority: P3 verification)

The home one-tap log uses a DropdownMenu when the user
taps the chevron to pick a non-default beer. The dropdown
items use a list shape (icon + name + price), not the new
tile grid. This is INTENTIONAL — home is vertically
constrained; a tile grid would push critical content
below the fold. After this spec, a code comment in
`home-one-tap-log.tsx` documents the intentional difference
so a future audit doesn't re-flag this.

**Why this priority**: Verification, not a behavior
change. The audit hedged; this spec lands the decision.

**Independent Test**: Read `components/home/home-one-tap-log.tsx`
after this spec ships. Confirm a clear comment explains why
the home picker uses the dropdown shape instead of a tile
grid. No behavior change.

**Acceptance Scenarios**:

1. **Given** the source file `home-one-tap-log.tsx`,
   **When** a developer reads it, **Then** a comment
   block near the dropdown render explains the intentional
   choice (home has limited vertical space, hence dropdown
   rather than tile grid).
2. **Given** the home one-tap dropdown today, **When**
   the user opens the dropdown, **Then** the dropdown
   item layout (icon + name + price) is unchanged from
   pre-026 behavior.

---

### Edge Cases

- **/log with one beer in catalog**: only one BeerTile
  size='card' renders. The grid still uses two columns
  (existing layout); the second column is empty. No
  layout regression.
- **Member with no last-beer** (US2's home banner): the
  initials fallback applies inside the new avatar slot;
  no broken image.
- **Treasurer is deactivated mid-settle** (US3): the
  avatar query still returns the row; the existing settle
  flow handles the inactive treasurer case unchanged.
- **Two beers with the same name in the catalog**:
  shouldn't happen (the catalog enforces uniqueness),
  but if it did, both tiles render with the same label —
  unchanged from today.

## Requirements

### Functional Requirements

- **FR-001**: System MUST expose a `BeerTile` component
  at `components/log/beer-tile.tsx` with a `size: 'card' |
  'tile'` prop. `size='card'` renders h-32 with a price
  line; `size='tile'` renders h-16 with name only. Both
  variants share the same selected-state styling
  (`bg-primary text-primary-foreground border-primary`)
  and the same hover state (`hover:bg-accent`).
- **FR-002**: `components/log/beer-grid.tsx` (the `/log`
  grid) MUST render `BeerTile size='card'` per beer. The
  inline className duplication is removed.
- **FR-003**: `components/log/log-on-behalf-form.tsx` MUST
  render `BeerTile size='tile'` per beer in its beer
  section. Inline duplication removed.
- **FR-004**: `app/[locale]/(app)/match/[agreementId]/RecordResultForm.tsx`
  MUST render `BeerTile size='tile'` per beer in its
  bet-beer picker. The Auto tile remains inline (it's
  not a `BeerTile` — it's a logical "use server default"
  affordance). Selected-state contract per spec 025
  preserved.
- **FR-005**: The on-behalf review banner query (in
  `lib/db/queries/on-behalf-review.ts` or its current
  location) MUST project the logger's `memberId`,
  `avatarKey`, and `avatarUploadAt` so the banner can
  render the logger's avatar.
- **FR-006**: `components/home/on-behalf-review-banner.tsx`
  MUST render `<MemberAvatar size="inline" />` before the
  logger name in the existing message. Existing button
  behavior is unchanged.
- **FR-007**: `components/home/home-one-tap-log.tsx` MUST
  carry a documentation comment near the DropdownMenu
  render explaining why the home one-tap picker uses a
  dropdown (not a tile grid) — the home button is
  vertically constrained.
- **FR-008**: All existing component tests
  (`home-one-tap-log.spec.tsx`, `on-behalf-review-banner
  .spec.tsx`, `record-result-form.spec.tsx`,
  `tab-entry-row.spec.tsx`, etc.) MUST continue to pass
  after the refactor. Tile-click assertions on the
  bet-beer picker (spec 025) keep working because
  `BeerTile` is just a styled wrapper around the same
  button semantics.
- **FR-009**: Cross-club / 404 / fallback behavior on
  avatar URLs continues to work unchanged (spec 021 +
  023 behavior preserved).

### Key Entities

- **BeerTile**: A reusable button-styled UI cell that
  renders a beer's name (+ price on size='card') and
  drives a selection callback. Props: `beer:
  { id, name, currentStock, unitPriceMinor? }`,
  `size: 'card' | 'tile'`, `selected: boolean`,
  `onClick`, `currencyCode`, `locale`. Owned by
  `components/log/`.
- **No new persistent entities**: this spec is pure UI
  + two read-side query extensions for avatar fields.

## Success Criteria

### Measurable Outcomes

- **SC-001**: After this spec, the same `BeerTile`
  component is the source of truth for the three beer-
  picking surfaces (`/log`, `/log/for`, match-result
  form). A grep for inline beer-tile className
  duplication returns zero matches.
- **SC-002**: The on-behalf review banner on the home
  page shows the logger's avatar inline next to their
  name. Verified by an extension to the existing
  `on-behalf-review-banner.spec.tsx` component test.
- **SC-003**: A `home-one-tap-log.tsx` comment near the
  dropdown render documents the intentional dropdown
  choice. Verified by a `grep` for the keyword phrase
  in the file.
- **SC-004**: All existing component tests pass with no
  modification beyond the new BeerTile + new banner-
  avatar assertions. No test deletions.
- **SC-005**: No regression on `/log`'s big-card visual:
  `BeerTile size='card'` renders identically to today's
  inline beer-grid card.
- **SC-006**: No regression on the spec 025 tile picker:
  `RecordResultForm` tests pass unchanged after the
  inline tile className is replaced by `<BeerTile
  size='tile' />`.

## Assumptions

- The on-behalf review banner query lives in
  `lib/db/queries/on-behalf-review.ts` (or close to it).
  Implementer to grep + confirm at task time.
- The `BeerTile` component is a thin styled-button
  wrapper around the existing tile pattern; it does NOT
  introduce any new logic (no isPending, no async). Its
  consumers continue to own the action state.
- `MemberAvatar`'s `size="inline"` variant from spec 023
  is the right size for both the home banner (US2) and
  the settle treasurer name (US3) — same in-text
  attribution context as `/tab` "od X" (the canonical
  inline-avatar surface).
- No new i18n keys are needed. All existing keys
  (banner copy, settle copy) are preserved verbatim;
  the avatar slots in next to the name.
- The home one-tap dropdown items get NO change in this
  spec — Q2 → α decision. The comment is the only
  artifact in `home-one-tap-log.tsx`.
- Test coverage strategy: integration test for each of
  the two extended queries (FR-005 + FR-007) verifying
  avatar fields surface; component test extensions on
  the two existing specs (banner + maybe one-tap-log
  for the comment-presence sanity check); a new
  small component test for `BeerTile` itself covering
  both variants. No new E2E.
- Performance: zero new round-trips. Both query
  extensions add nullable columns to an existing
  result set.
