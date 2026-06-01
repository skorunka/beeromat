# Phase 0 Research: Inline "Log for Someone Else" on Home

All four design questions were resolved with the user (Clarifications session). No open `NEEDS CLARIFICATION`. Technical decisions:

## Decision 1 — Inline client control fed by the server home page

**Decision**: New client component `HomeLogForOther` rendered on the (server) home page. The page loads the other-active-members list (`listOtherActiveMembers`) and the in-stock catalog (already loaded) and passes both as props. The control holds `expanded`, `memberId`, `beerId` local state; on Log it calls `logBeerOnBehalfAction` and `router.refresh()`.

**Rationale**: No page reload (FR-005) requires client interactivity + a server-action call + `router.refresh()` to re-render the server home (refreshing the round breakdown) without navigation — the exact pattern `home-one-tap-log.tsx` already uses for self-log. The member list is the only new data the page must fetch.

**Alternatives considered**:
- *Keep navigating to /log/for* — rejected: the whole point is to stay on home with no reload.
- *Client-fetch the member list* — rejected: the server page can load it cheaply and pass it down; avoids a client round-trip + loading state.

## Decision 2 — New common `BeerPickerDropdown`

**Decision**: New `components/picker/beer-picker-dropdown.tsx` mirroring `MemberPickerDropdown`: a base-ui DropdownMenu; trigger shows the selected beer name (or placeholder) + a Beer icon + chevron; a radio group of options, each "{name} … {price}", min-h-12, out-of-stock disabled. Props `{ beers, value, onChange, currencyCode, locale, placeholder, ariaLabel }`.

**Rationale**: FR-002 wants a dropdown beer selector "matching the member dropdown". Mirroring `MemberPickerDropdown` gives identical interaction + finger sizing. Building on the shared DropdownMenu primitive keeps it consistent and dependency-free.

**Alternatives considered**:
- *Reuse the home one-tap inline beer dropdown* — that one is coupled to self-logging (logs immediately on item tap). The on-behalf control needs a *selection* (pick beer, then pick member, then Log), so a select-style dropdown with a value is the right shape.
- *Beer tile grid (as /log/for uses)* — rejected by Q4: too tall on home; dropdown is compact.

## Decision 3 — Keep selections + refresh in place after a successful log

**Decision**: On success: `celebrateBeer()` + success toast naming beer + member, `router.refresh()`, and DO NOT clear `memberId`/`beerId` or collapse. On failure: toast the typed error, change nothing.

**Rationale**: FR-006 — logging a table's round is the common case; persisting selections makes the 2nd+ beer one or two taps. `router.refresh()` re-renders the server home so the round breakdown (spec 028) updates in place. Mirrors the self-log refresh.

**Alternatives considered**:
- *Reset after each log* — rejected by Q2; slower for rounds.
- *Collapse after log* — rejected; the member is mid-round, keep it open.

## Decision 4 — Affordance presence + removal of the old link

**Decision**: The control renders only when the club has other active members (same guard as today's `LogForOtherLink`, via a `hasOtherMembers` prop). The old `LogForOtherLink` is only used on home, so its usage is replaced; the now-unused component file is removed (no other references).

**Rationale**: FR-008 parity with the existing hide-when-no-others behavior. Removing dead code keeps hygiene (Principle VII).

**Alternatives considered**:
- *Keep `LogForOtherLink`* — rejected: it would be dead after the swap (only home used it).

## Decision 5 — Reuse on-behalf i18n

**Decision**: Reuse `log.onBehalf.*` (`ctaLink` for the collapsed label, `memberHint`, `toastLogged`, `toastError`, `errors.targetSelf`, `errors.targetNotInClub`). Add a beer-picker placeholder key + a Log button label only if not already covered (`submitCta` exists but is sentence-form; a short `logCta` may be added).

**Rationale**: Constitution i18n constraint + DRY. Most strings already exist from spec 019.
