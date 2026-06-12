# Feature Specification: Log a round

**Feature Branch**: `main` (trunk-based — no feature branch)

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Log a round — batch on-behalf beer logging for the 'it's your turn to fetch the round' use case. Evolve the home 'Zapsat pro jiného člena' control into a multi-select round logger where each drinker owes their own beer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pour a same-beer round in one tap (Priority: P1)

It is the member's turn to fetch beers for the table. Everyone is having the
house lager. Instead of recording the same beer four separate times through the
single-person picker, the member picks the beer once, taps the avatars of
everyone drinking (themselves included), sees a running count, and taps a single
"log the round" button. Each selected person's beer lands on **their own** tab;
the member who fetched is just the one who recorded it.

**Why this priority**: This is the core of the feature and the whole reason it
exists — turning N repetitive single logs into one action. It delivers the
entire value on its own; the rest is refinement.

**Independent Test**: Select a beer, select three teammates plus yourself, tap
"log the round", and confirm four consumptions were recorded — one on each
selected person's tab — with the correct beer and price, the catalogue stock
reduced by four, and a celebratory confirmation shown.

**Acceptance Scenarios**:

1. **Given** an open round and an in-stock beer, **When** the member selects that
   beer, selects themselves and three teammates, and confirms, **Then** four
   beers are recorded — one on each selected person's own tab — the member's own
   beer needs no review, and each of the three teammates receives a "logged for
   you" review item.
2. **Given** the member has opened the round control, **When** they tap and
   un-tap teammate avatars, **Then** the running count and the confirm button
   label update to reflect the current number of selected drinkers.
3. **Given** a successful round, **When** the confirmation completes, **Then**
   the member stays on the home screen, this round's breakdown and totals update
   in place (no navigation), and the selection resets ready for the next round.
4. **Given** the member is fetching but not drinking, **When** they deselect
   themselves and select only teammates, **Then** only the teammates' beers are
   logged (all as "logged for you" items) and nothing lands on the fetcher's tab.

---

### User Story 2 - One person wants something different (Priority: P2)

Most of the table is on the house lager, but one teammate wants a different beer.
The member sets the round's default beer, then overrides that single person's
beer before confirming, and the round logs the right beer for each drinker.

**Why this priority**: Mixed rounds are common enough that forcing two separate
round-logs would re-introduce the friction the feature removes — but the
same-beer round (P1) is still useful without it.

**Independent Test**: Set the round beer to A, select three people, override one
of them to beer B, confirm, and verify two people got beer A and one got beer B,
each on their own tab.

**Acceptance Scenarios**:

1. **Given** a round with a default beer selected and three drinkers, **When**
   the member overrides one drinker to a different in-stock beer and confirms,
   **Then** that drinker's beer is the override and the others get the default.
2. **Given** a drinker has an override, **When** the member clears the override,
   **Then** that drinker reverts to the round's default beer.

---

### User Story 3 - A beer runs out mid-round (Priority: P3)

While confirming the round, one of the chosen beers is out of stock. Rather than
failing the whole round, the system logs every beer it can and clearly reports
which person/beer it had to skip, so the member can sort that one out.

**Why this priority**: Robustness for a real-world edge (stock hits zero between
opening the control and confirming). The happy path (P1/P2) works without it;
this just prevents an all-or-nothing failure from losing the whole round.

**Independent Test**: Take one beer to zero stock, build a round that includes
it, confirm, and verify the in-stock beers were all logged and the skipped
person/beer is named in the result.

**Acceptance Scenarios**:

1. **Given** a round where one selected beer is out of stock at confirm time,
   **When** the member confirms, **Then** every in-stock beer in the round is
   logged and the member is told which drinker/beer was skipped.
2. **Given** every beer in the round is out of stock at confirm time, **When**
   the member confirms, **Then** nothing is logged and the member is told the
   round could not be recorded.

---

### Edge Cases

- **No one selected**: the confirm action is unavailable until at least one
  drinker is selected.
- **No open round**: logging a round behaves like logging a single beer when no
  round is open — the system opens/uses the current round the same way a normal
  log does (no new behaviour introduced here).
- **Duplicate person**: a person can appear in a round at most once (one beer per
  drinker per round); selecting them again does not stack a second beer.
- **Empty / single-member club**: when there are no other active members, the
  round control offers only the member themselves (it degrades to a self-log) or
  is hidden, consistent with how the existing log-for-other control appears only
  when other members exist.
- **Mis-tap recovery**: each beer logged for someone else is independently
  reversible by that person via the existing "logged for you" keep/reject review
  and by the normal undo window — there is no separate "undo the whole round".
- **Price/stock changes**: each logged beer uses the beer's current price and
  decrements its stock at the moment of logging, exactly as a single log does.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The home logging control MUST let a member select **multiple**
  drinkers (themselves and/or other active members of their club) for a single
  "round" instead of one person at a time.
- **FR-002**: The member MUST be able to choose one **default beer** for the
  round, pre-filled with their usual/last beer, applied to every selected drinker
  unless individually overridden.
- **FR-003**: The control MUST show a live count of how many beers the round will
  log and reflect it on the confirm action's label.
- **FR-004**: On confirm, the system MUST record **one beer per selected drinker**
  such that **each beer is charged to that drinker's own tab** — never to the
  fetcher's tab on others' behalf.
- **FR-005**: A beer the member logs for **themselves** as part of a round MUST
  behave exactly like a normal self-log (no "logged for you" review of their own
  beer); a beer logged for **another** member MUST behave like the existing
  on-behalf log, producing that member's "logged for you" review item.
- **FR-006**: Each logged beer MUST use the beer's current price and reduce that
  beer's stock, identically to logging a single beer.
- **FR-007**: The member MUST be able to **override** the beer for an individual
  drinker (and clear that override back to the round default) before confirming.
- **FR-008**: The confirm action MUST be unavailable when zero drinkers are
  selected.
- **FR-009**: If one or more selected beers are out of stock at confirm time, the
  system MUST log every in-stock beer in the round and report which drinker/beer
  was skipped (partial success — the round is NOT rejected wholesale). If **all**
  selected beers are out of stock, nothing is logged and the member is told the
  round could not be recorded.
- **FR-010**: On success the member MUST remain on the home screen with this
  round's breakdown and balances updated in place (no navigation), a celebratory
  confirmation shown, and the selection reset for the next round.
- **FR-011**: A member MUST only be able to log a round for members of **their own
  club**; the action MUST reuse the same authorization as logging a single beer
  for oneself and for another member.
- **FR-012**: A given drinker MUST appear at most once per round (one beer per
  drinker per round).

### Key Entities *(include if feature involves data)*

- **Round (transient)**: a not-yet-submitted selection the member is composing —
  a default beer plus a set of drinkers, each optionally carrying a beer
  override. It is purely client-side intent; it is not stored as its own record.
- **Logged beer (consumption)**: one beer charged to one drinker's tab, created
  per selected drinker on confirm. Reuses the existing consumption concept,
  including its self vs on-behalf distinction and the on-behalf review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can record a same-beer round for four people in **a single
  confirmation** (one beer pick + four taps + one button), versus four separate
  single-person logs today.
- **SC-002**: After confirming a round of N drinkers, exactly N beers are
  recorded — one on each selected person's own tab — with correct beer and price,
  and stock reduced by N (or by the number actually in stock, per FR-009).
- **SC-003**: A member can compose and submit a round for the typical table size
  (2–7 people) in under 15 seconds.
- **SC-004**: 100% of beers logged for **other** people via a round are
  recoverable by those people through the existing keep/reject review, the same
  as a single on-behalf log.
- **SC-005**: A round containing one out-of-stock beer still records every other
  beer in the round (no wholesale failure) and names the skipped drinker/beer.

## Assumptions

- **Each drinker owes their own beer** — confirmed with the user. The fetcher is
  only the recorder; there is no "the buyer treats the table" money model in v1.
- **Evolve the existing control** — the round lives in the existing in-card
  "log for another member" control (now multi-select), not on a new page or a
  new bottom-nav entry. Single-person logging remains the degenerate case of a
  one-person round.
- **Partial success on out-of-stock** — confirmed lean: log what is in stock and
  report the rest, rather than rejecting the whole round.
- **One beer per drinker per round** — quantity > 1 for a person is out of scope;
  the member runs another round for the next pour.
- **No whole-round editing/undo** — each consumption is independently undoable via
  the existing undo window and the recipient's review; the round is not tracked
  as an editable unit.
- **Reuses existing machinery** — the open-round/session handling, beer catalogue
  + stock, the consumption ledger, the self-log and on-behalf-log behaviours, the
  "logged for you" review, the member roster, and the celebratory confirmation
  are all reused as-is.
- **Mobile-first, club-scoped, trunk-based**, consistent with the rest of the app.
