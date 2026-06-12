# Phase 0 Research: Log a round

All "unknowns" here are design decisions, not missing facts — the codebase
already provides every primitive. Each decision below is resolved.

## D1 — Persistence model: reuse `consumptions`, no new table

**Decision**: A round persists as **N ordinary `consumptions` rows** (one per
drinker), written in one transaction. No new table, no migration. The "Round" is
purely client-side transient state until submit.

**Rationale**: The spec's semantics ("each drinker owes their own beer") map
exactly onto the existing consumption row: `member_id = drinker`,
`created_by_user_id = the fetcher`, `unit_price_minor_snapshot`, `drink_session_id`.
Nothing about a round needs to be queried back *as a round* — there is no
whole-round edit/undo (out of scope), each beer is independently
undoable/rejectable. Adding a `round_id` would be dead weight (FR has no
round-level read).

**Alternatives considered**:
- *A `rounds` table grouping the consumptions* — rejected: no requirement reads
  or mutates a round as a unit; it would be an unused FK + migration.
- *A `quantity` column on consumptions* — rejected: out of scope (one beer per
  drinker per round); the ledger is one-row-per-beer everywhere else and the tab
  breakdown counts rows.

## D2 — Self vs on-behalf within one batch: no special-casing needed

**Decision**: Every item in the round is written identically —
`member_id = item.memberId`, `created_by_user_id = actor`. The logger's own beer
is just an item whose `memberId == actor's member id`.

**Rationale**: The existing "logged for you" review predicate is
`consumption.member_id == me AND consumption.created_by_user_id != my user`
(see `onBehalfReviewSummaryForMember` / `voidConsumptionAction`'s
`isConsumerRejectingOnBehalf`). A self-beer has `created_by == member's user`, so
it **automatically** produces no review item, while each teammate's beer does —
FR-005 falls out for free without branching. The single-log self path
(`logBeerAction`) and on-behalf path (`logBeerOnBehalfAction`) differ only in
`member_id`; the batch collapses them.

**Alternatives considered**:
- *Call `logBeerAction` for self + `logBeerOnBehalfAction` per teammate* —
  rejected: N separate transactions (N session look-ups, N round-trips, partial
  failure handling across calls). One transaction is simpler and atomic.

## D3 — Out-of-stock handling: partial success, skip + report

**Decision**: Inside the single transaction, iterate items; for each, attempt the
atomic stock decrement (`... WHERE current_stock > 0 RETURNING`). If it returns no
row, **skip** that item and record `{memberId, beerTypeId, reason:'OUT_OF_STOCK'}`;
continue with the rest. Same for a beer that isn't available
(`BEER_NOT_AVAILABLE`) or a target who isn't an active club member
(`TARGET_NOT_IN_CLUB`). Commit the logged rows. If **every** item skipped, return
`{ok:false, code:'ALL_SKIPPED'}` (nothing was inserted). Otherwise
`{ok:true, logged, skipped, balanceAfterMinor}`.

**Rationale**: FR-009 + the user's stated lean. A round of four shouldn't be lost
because the IPA hit zero between opening the control and confirming; log the three
lagers, tell the fetcher the IPA was skipped. The per-item conditional decrement
already used by `logBeerAction` makes the skip race-safe (no check-then-act gap).

**Alternatives considered**:
- *All-or-nothing (roll back the whole round on any out-of-stock)* — rejected:
  punishes the table for one empty keg; forces re-composing the whole round.
- *Pre-validate stock before the tx and block submit* — rejected: TOCTOU; stock
  can change between validate and write. The authoritative check is the
  conditional decrement inside the tx; partial skip handles the rest.

## D4 — Roster includes the logger

**Decision**: Add `listActiveMembersForRound(clubId, selfMemberId)` returning
**all** active members of the club (the logger included) with avatar fields
(`id, displayName, avatarKey, avatarUploadAt`), the logger flagged/sorted first.
The control pre-selects the logger.

**Rationale**: The fetcher is normally drinking too, so they must be a
first-class, pre-selected tile. `listOtherActiveMembers` deliberately excludes
self (it powers the single on-behalf picker), so a sibling query that includes
self keeps each caller's intent explicit rather than overloading one query with a
flag at every call site.

**Alternatives considered**:
- *Pass `listOtherActiveMembers` + synthesize the self tile from `ctx.member`* —
  rejected: `ctx.member` doesn't carry `avatarUploadAt` in a guaranteed shape;
  one query that returns the whole roster with consistent avatar fields is
  cleaner and matches the other `*-avatar-fields` query precedents.

## D5 — Multi-select UI + per-person override

**Decision**: Evolve `home-log-for-other.tsx` into `round-logger.tsx`: a
collapsed affordance (as today) that expands to (a) a **default beer** picker
(pre-filled with the logger's usual), (b) an **avatar toggle grid** of the roster
(logger pre-selected), with a live "🍺 ×N" counter, and (c) one submit button
"Zapsat rundu · N piv". A per-person **override** is a small beer chip on each
selected avatar; tapping it opens a `BeerPickerDropdown` scoped to that drinker
(clearing the override reverts to the round default). Submit builds
`items = selected.map(m => ({ memberId: m, beerTypeId: override[m] ?? defaultBeer }))`
and calls `logRoundAction`; on success → celebrate, toast summarising
logged/skipped, `router.refresh()`, reset selection (spec-029 stay-on-home
behaviour, extended).

**Rationale**: Reuses `MemberAvatar`, `BeerPickerDropdown`, `celebrateBeer`, and
the spec-029 inline pattern. The avatar grid is the natural multi-select for a
table of people; the override-as-chip keeps the common "everyone same beer" path
one decision while still allowing the odd-one-out.

**Alternatives considered**:
- *A checklist of names* — rejected: avatars are the established member-identity
  primitive (specs 020–024) and read faster for a table you can see.
- *Per-person beer always visible* — rejected: clutters the 90% same-beer case;
  the override is progressive disclosure.

## D6 — No new money/transfer concept

**Decision**: Confirmed out of scope — "bringer treats the table" is not built.
Each drinker owes their own beer.

**Rationale**: User decision; keeps Principle III (track-don't-transact) and
avoids reviving the removed casual-bet/transfer money model (spec 030 removed it).

## D7 — Forms standard applicability

**Decision**: The round logger is a tap-driven picker, not a text form; it does
**not** adopt `react-hook-form`. Authority is the Zod `logRoundSchema` validated
server-side in `logRoundAction`.

**Rationale**: The User Input & Forms standard targets text/validation forms and
native date/time + native validation attributes. This control has none — it's
avatar toggles + dropdown pickers + a button, like the existing one-tap log and
spec-029 on-behalf control, which are likewise not RHF forms. `forms:check` stays
green.
