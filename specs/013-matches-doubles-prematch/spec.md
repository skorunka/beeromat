# Feature Specification: Doubles + Pre-Match Agreement (v1.13)

**Feature Branch**: `013-matches-doubles-prematch`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description (2026-05-25): Extend spec 012 matches with
(a) doubles support — doubles is the club's default match format
(2v2) — and (b) a pre-match agreement flow where the players agree
in the app, before the match starts, whether they are "playing for
beer" or not. If yes, the post-match settlement reuses 012's
bet-transfer pipeline; if no, the match is logged but no transfers
happen. Stakes are structural: singles = 1 beer (loser → winner);
doubles = 2 beers (each loser owes one to a paired winner, where the
creator picks the pairing at agreement time). Same-club only. Any
member can create / edit / record result.

## Personas

- **P1 — Pavel, 45 · Club admin**: Wednesday-night doubles
  organiser. Opens the app at the courts before play, taps in the
  4 players, confirms "for beer? yes", picks who pays whom on a
  loss. That's the pre-match agreement.
- **P3 — Tereza, 34 · Bilingual on iPhone**: doubles partner with
  Pavel. After the match she records the result on her phone — one
  tap to mark which side won. If for beer, the settlement runs.
- **P2 — Standa, 67 · Czech only**: opposite side. After his side
  loses, opens his own beeromat and sees one specific opponent he
  owes a beer to — clear and unambiguous (no "which winner?" UX
  puzzle for a 67-year-old at the bar).

## Clarifications

### Session 2026-05-25

- Q: When a doubles result is recorded, how does it land in the existing `matches` table? → A: Two rows per doubles result (one per pairing), sharing an `agreement_id` back-pointer. Reuses 012's `(winner_member_id, loser_member_id)` shape unchanged; doubles is "two matches that share an agreement".
- Q: Who can record a match result? → A: Only the named match participants (the 2 in singles, the 4 in doubles), with a treasurer-and-above override. Create / edit / cancel an open agreement stays open to any club member; only the high-stakes "record result" action is restricted.
- Q: Where does the upcoming-agreements list surface? → A: `/match` is reshaped into a hub. Top zone: "Upcoming" — list of open agreements with a per-row "Record result" CTA (visible only to participants + treasurer per FR-007). Below: a single "New match" entry-point that opens the create-agreement flow. One nav slot, one destination. (Initial answer mentioned preserving the legacy 012 quick-log as a second entry-point; that was reversed by the Q5 decision below — see FR-015a.)
- Q: How does the creator specify doubles pairing? → A: Explicit pick — no default. The creator must tap each pairing during agreement creation (pair-the-faces UI or a dropdown per A-seat selecting the B-seat opponent). 2 deliberate taps per agreement, every time. Zero ambiguity about who owes whom. Editable until result is recorded.
- Q: What's the disposition of the legacy 012 one-step singles log? → A: Sunset on 013 ship. The legacy `/match` quick-log form is removed; every new singles match goes through the agreement flow (which can be created-and-resulted in two consecutive taps if play is spontaneous). Historical 012 rows (created before 013 shipped) remain intact with `agreement_id = NULL` — past data is not rewritten. One mental model going forward.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Doubles match for beer, full loop (Priority: P1)

**Why this priority**: this IS the feature. Doubles is the club's
default format and "for beer = yes" is the common case. If only US1
ships, the club already gets the headline outcome they asked for:
plan a doubles match for beer, play, record the result, settle.

**Independent Test**: Four members exist in a club. Member A creates
a doubles agreement (side X: A + B; side Y: C + D), marks it for
beer, picks the pairing (A→C, B→D). Members go play. Anyone records
"side Y won". Assert: a match record exists for each loser→winner
pair from the agreement (A owes C 1 beer, B owes D 1 beer), and
those two debts are queued for settlement through 012's existing
bet-transfer pipeline. Total: 2 beers transferred from losing side
to winning side, paired per the creator's choice.

**Acceptance Scenarios**:

1. **Given** four distinct club members and an authenticated member,
   **When** the member opens the new-match flow and picks doubles
   (the default), assigns the 2v2 lineup, marks "for beer" yes, and
   confirms the pairing, **Then** an agreement record exists with
   format=doubles, for_beer=yes, the 4 player assignments, and the
   pairing — and the agreement appears in the upcoming-matches view.
2. **Given** an open doubles-for-beer agreement, **When** a match
   participant (or a treasurer override) records "side Y won",
   **Then** exactly 2 beer-debt entries are created (one per loser
   → their paired winner) via the existing bet-transfer pipeline,
   and the agreement transitions to result-recorded state.
3. **Given** a result-recorded agreement, **When** a match participant
   (or treasurer) reverses the result within 5 minutes, **Then**
   both beer-debt entries are voided and the agreement returns to
   "open" state, matching the 012 undo behaviour.

---

### User Story 2 — Singles via the agreement flow (Priority: P2)

**Why this priority**: 012 shipped singles as a one-step log; 013
sunsets that UI and routes all new singles through the agreement
flow (per FR-017). US2 is the slice that proves the agreement flow
handles singles cleanly — and that spontaneous singles can be
captured back-to-back (create + immediately record) in a couple
of taps, matching the old one-step UX in spirit if not in form.

**Independent Test**: Two members. Member A creates a singles
agreement (A vs B, for beer = yes), then immediately records
"A won". Assert: 1 beer-debt entry is created (B owes A 1 beer)
via the existing 012 pipeline. Confirm the legacy 012 one-step
UI is no longer reachable from `/match`.

**Acceptance Scenarios**:

1. **Given** two members and an authenticated member, **When** the
   member opens the new-match flow and switches the format from
   doubles to singles, picks the 2 players, marks for beer yes,
   **Then** an agreement exists with format=singles, no pairing
   step (1v1 is implicit), and shows in upcoming-matches.
2. **Given** an open singles agreement, **When** a match participant
   (or treasurer) records the winner, **Then** exactly 1 beer-debt
   entry is created (loser → winner) via the existing 012 pipeline.

---

### User Story 3 — Non-beer match (Priority: P2)

**Why this priority**: not every match is for beer. The agreement
captures the "yes/no" decision so there's no ambiguity later — but
on result recording, "no" means zero settlement. Without US3, every
agreement would force-create transfers, which is wrong for friendly
practice matches.

**Independent Test**: Members create an agreement (singles or
doubles) with for-beer = no. Record the result. Assert: the
agreement transitions to result-recorded, but zero bet-transfer
entries are created. The match shows in history as "not for beer".

**Acceptance Scenarios**:

1. **Given** an agreement with for_beer = no, **When** a match
   participant (or treasurer) records the winning side, **Then** the
   result is stored, zero bet-transfer entries are created, and the
   agreement displays a "Friendly" chip on the agreement detail
   page AND in the upcoming-matches listing — visually distinct
   from for-beer agreements per FR-009.

---

### User Story 4 — Edit or cancel an open agreement (Priority: P3)

**Why this priority**: until the result is recorded, the agreement
is editable — a player drops out, the for-beer call changes, the
lineup swaps. Without US4 you can still always cancel + recreate,
so US4 is a friction-reduction slice, not a hard blocker.

**Independent Test**: Member creates an agreement. Before any
result is recorded, the member (or any other member) edits the
lineup / pairing / for-beer flag. Assert: the change persists and
no result-side state is affected. Cancel deletes the agreement
entirely.

**Acceptance Scenarios**:

1. **Given** an open agreement (no result yet), **When** any club
   member edits the lineup, pairing, or for-beer flag, **Then** the
   change persists and the agreement remains in "open" state.
2. **Given** an open agreement, **When** any club member cancels it,
   **Then** the agreement is removed from upcoming-matches and no
   match-history record is written.
3. **Given** a result-recorded agreement (even within the 5-min undo
   window), **When** a member attempts to edit the lineup/pairing/
   for-beer flag, **Then** the edit is rejected — only the undo path
   is available to reverse the result first.

---

### Edge Cases

- **Same member on both sides**: an agreement where the same member
  appears on side A and side B (or on both seats of the same side
  in doubles) is rejected at creation time — matches the 012
  "winner ≠ loser" invariant, extended to all 4 doubles seats.
- **Member deactivated between agreement and result**: if a member
  is removed from the club between agreement creation and result
  recording, recording the result still succeeds; the bet-transfer
  uses the historical member id (the constitution's append-only
  ledger principle — the past doesn't get rewritten). If ALL named
  participants are deactivated, the treasurer override is the only
  path left to record (per FR-007).
- **Concurrent result recording**: two members try to record the
  result simultaneously. The first wins; the second sees the result
  already recorded with a clear message ("already settled by [name]
  N seconds ago — undo if wrong").
- **Forgotten agreement**: an agreement is created but no result
  is ever recorded. It remains in "open" state forever (or until
  someone cancels it). No automatic cleanup — manual hygiene.
- **Pairing edit after one side already won**: blocked. Pairing
  affects the settlement; once the result is in, pairing is locked
  (only undo + re-record changes it).
- **For-beer flipped after result is in**: blocked. Flipping for_beer
  yes↔no after result recording would either spawn or void debts
  retroactively — confusing. Force undo + re-record.
- **No undo after 5 minutes**: matches 012's window. Beyond 5
  minutes the result is locked; corrections happen via the
  treasurer's existing payments-dispute flow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let any club member create a pre-match
  agreement specifying format (singles or doubles).
- **FR-002**: System MUST default the format to doubles when a
  member opens the create-agreement flow.
- **FR-003**: Doubles agreements MUST capture exactly 4 distinct
  club members assigned to two sides (2 per side).
- **FR-004**: Singles agreements MUST capture exactly 2 distinct
  club members assigned to two sides (1 per side).
- **FR-005**: Every agreement MUST record an explicit for-beer
  flag (yes or no) at creation time.
- **FR-006**: Doubles agreements MUST capture a 1-to-1 pairing
  between side A members and side B members at creation time
  (each side-A member is paired with exactly one side-B member,
  determining who owes whom on a loss). The UI MUST require the
  creator to explicitly pick each pairing (no implicit default by
  seat position); the create-agreement flow MUST NOT allow
  submission until both pairings are chosen. Pairing is editable
  until the result is recorded.
- **FR-007**: System MUST restrict result recording to the named
  match participants (the 2 members in singles, the 4 in doubles).
  Members with role `treasurer` or above MAY also record any
  agreement's result as an override path.
- **FR-008**: On result recording for an agreement with for_beer = yes,
  the system MUST create exactly 1 beer-debt entry for singles, or
  exactly 2 beer-debt entries (one per pairing) for doubles, via
  the existing bet-transfer pipeline from spec 012.
- **FR-009**: On result recording for an agreement with for_beer = no,
  the system MUST create zero beer-debt entries while still
  persisting which side won. The agreement MUST be visually marked
  with a "Friendly" chip on the upcoming-matches list and the
  agreement detail page; the chip MUST be styled distinctly from
  for-beer agreements (different background or color, not just a
  text label) so members can tell at a glance which matches will
  produce beer transfers on result.
- **FR-010**: System MUST allow result reversal within 5 minutes
  of recording (matching the 012 undo window). Reversal MUST void
  all bet-debt entries created by the original recording. Reversal
  is restricted to the same actor set as recording (match
  participants + treasurer override).
- **FR-011**: System MUST let any club member edit the lineup,
  pairing, or for-beer flag of an agreement that has no recorded
  result yet.
- **FR-012**: System MUST let any club member cancel an agreement
  that has no recorded result yet; cancelled agreements are
  removed from view and create no match-history record.
- **FR-013**: System MUST block all edits/cancellation once a
  result is recorded (even within the undo window); reversal is
  the only path back to "open".
- **FR-014**: System MUST reject agreements where the same member
  appears on more than one seat (any side, any seat).
- **FR-015**: The `/match` route MUST host an "Upcoming" zone
  listing all open (result-not-recorded) agreements for the
  member's club, ordered most recently created first. Each row
  MUST expose a "Record result" CTA visible only to that
  agreement's participants (or to treasurers, per FR-007).
- **FR-015a**: The `/match` route MUST host a single "New match"
  entry-point that opens the create-agreement flow (default
  format = doubles per FR-002). Spontaneous singles (no pre-match
  agreement happened) use the same flow: create the agreement and
  immediately record the result back-to-back. No separate
  "quick log" affordance (per FR-017).
- **FR-016**: Result-recorded agreements MUST be discoverable
  through the existing transfer-history view via the
  `bet_transfers` rows the settlement creates. The `agreement_id`
  foreign key on each `matches` row preserves the linkage for any
  future per-match history view, which is deferred to a follow-up
  spec. No new dedicated match-history view ships in v1.13.
- **FR-017**: 013 MUST remove the legacy 012 one-step singles
  log UI from `/match` (sunset on ship). The underlying `matches`
  table and its historical rows are preserved (constitution's
  append-only ledger principle); historical 012 rows have
  `agreement_id = NULL`. Every NEW singles match created from 013
  onward MUST go through the agreement flow.

### Key Entities

- **Match Agreement**: a pre-match record. Holds club id, format
  (singles or doubles), for-beer flag, creator, creation time,
  result-recorded time + recorder + winning side (null until
  recorded), and reversed-at + reversed-by metadata for the undo
  path.
- **Match Agreement Side Membership**: which member sits on which
  side. For singles: one member per side. For doubles: two members
  per side. The "seat" within a side matters for doubles because
  it carries the pairing.
- **Match Doubles Pairing**: for doubles only, the 1-to-1 mapping
  between side-A seats and side-B seats. Determines who owes whom
  a beer on a loss. Singles needs no pairing (implicit 1v1).
- **Match Bet Debt** *(reuses spec 012's matchBetTransfers)*: each
  beer the loser owes a winner. Created at result-recording time
  when for_beer = yes; voided on undo.
- **Match Rows ↔ Agreement** *(clarified 2026-05-25)*: a recorded
  singles agreement produces 1 row in the existing `matches` table
  (012's `winner_member_id` + `loser_member_id` shape unchanged).
  A recorded doubles agreement produces 2 rows in `matches`, one
  per pairing (loser_a → winner_b, loser_b → winner_a). Both rows
  share an `agreement_id` foreign key that groups them into one
  logical match for the upcoming-matches view + downstream
  aggregations. Historical 012 rows (created before 013 shipped)
  remain with `agreement_id = NULL` — past data is preserved as
  ledger history; only new singles go through the agreement flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can capture a complete doubles-for-beer
  agreement (format + 4 players + pairing + for-beer flag) in
  under 30 seconds on a phone, including 4 player picks.
- **SC-002**: Recording the result and seeing the settlement
  toast completes in under 2 seconds end-to-end (perception:
  "instant"), matching the 012 baseline.
- **SC-003**: For 100% of recorded doubles-for-beer matches,
  exactly 2 beer-debt entries are created — one per pairing —
  with no manual reconciliation needed.
- **SC-004**: For 100% of recorded for-beer = no matches, exactly
  0 beer-debt entries are created.
- **SC-005**: Spec 012's existing singles one-step log path
  continues to function unchanged after 013 ships — zero
  regressions across the existing 012 e2e suite.
- **SC-006**: 95% of result-recorded matches are recorded by a
  member from the actual match (player or opponent), not by a
  treasurer reconciling after the fact — measured by comparing
  recorder identity against agreement participants.
- **SC-007**: The 5-minute undo path is exercised on under 5% of
  recorded matches — a healthy signal that recording is accurate
  the first time.

## Assumptions

- **Same-club only**: all 4 (or 2) players are members of the same
  beeromat deployment. Cross-club opponents are explicitly out of
  scope (a future spec — would need cross-deployment identity).
- **Any club member can create + edit + record result**: matches
  the user's stated permission model. No role-gating beyond "must
  be a club member".
- **Doubles is the default format**: matches the club's actual
  playing pattern (Wednesday-night doubles). Singles is available
  via a format toggle inside the same flow.
- **Pairing is creator's choice at agreement time** *(confirmed
  in clarifications)*: explicit pick, no implicit default. The
  creator must tap each pairing during agreement creation;
  submission is blocked until both are set. Editable until result
  is in. See FR-006.
- **Reuses 012 schema where possible**: each recorded doubles
  result lands as **two rows** in the existing `matches` table
  (one per pairing), sharing a nullable `agreement_id` back-pointer
  that groups them into one logical match. Singles produces 1 row.
  012's `(winner_member_id, loser_member_id)` shape is unchanged —
  no array columns, no extra join tables needed for the history
  view. Historical 012 one-step singles rows (created before 013
  shipped) have `agreement_id = NULL` and are preserved. New
  tables capture agreement-only state (the pre-match record +
  the pairing definition + the for-beer flag). The 012 one-step
  log UI is removed from `/match` on 013 ship (per FR-017); the
  underlying write-path code may be deleted with it or left
  unused — implementation choice. Constitution v1.7 Fresh Code
  Hygiene — 012's schema stays, 013 layers on top.
- **Reuses 012 bet-transfer pipeline for settlement**: no new
  payment mechanic. The for-beer-yes path calls the same code 012
  calls; the for-beer-no path skips that call.
- **Reuses 012's 5-minute undo window** for result reversal.
- **Stakes are structural, not user-chosen**: 1 beer per pairing.
  Per-match beer count override (e.g., "best of 3 sets = 3 beers")
  is a future spec.
- **Match details out of scope**: scoring, sets, dates beyond
  creation time, court, format variants (mixed doubles vs men's,
  best-of-N) are all out of scope for v1.13.
- **No notifications**: members open the app to record the result.
  Push/email reminders are a future spec.

## Out of Scope (explicitly deferred)

- Cross-club matches (opponents from other beeromat deployments).
- Detailed scoring or per-set tracking.
- Match disputes — handled via the existing payments-dispute flow
  (treasurer resolves).
- Other formats (mixed doubles distinction, best-of-3, tournament
  brackets).
- Configurable per-match beer count.
- Scheduled / future-dated matches (calendar entries).
- Reminders / notifications about open agreements.
