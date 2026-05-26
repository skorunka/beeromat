# Feature Specification: Match-bet → home awareness (v1.12)

**Feature Branch**: direct-to-`main`, trunk-based.

**Created**: 2026-05-26

**Status**: Shipped (MVP, 2026-05-26) — US1 + US2 + transaction rewrite landed. US3 (/tab + admin "ze zápasu" distinction) and the beer-picker UI in `RecordResultForm` are deferred as small follow-ups; backend override path is already wired.

**Input**: User description: "next spec — bet → home awareness. Close
flow #3 from the panel. When the match flow ends and the loser owes
beers, show it on home with a one-tap accept that creates the
consumption rows. Until then it lives in /bet that nobody opens."

## Clarifications

### Session 2026-05-26

- Q: Which settlement model creates the bet-linked consumption + transfer rows? → A: **Option A — Auto-create on match settlement.** Match-settlement transaction also creates consumption + bet_transfer rows. Loser sees passive notification on home with visible undo. Zero taps.
- Q: What beer type backs the auto-created consumption? → A: **Option 1 with override.** Default is the winner's last-logged beer (reusing spec-017's `lastBeerForMember`); fallback for first-match winners is the cheapest in-stock beer. The match-result-recording UI exposes an OPTIONAL beer picker so the person submitting the result can override the default before settlement commits (no post-settle change to avoid void/recreate audit churn).
- Q: How does `match_loser_beer_count` split across the two members of a doubles losing side? → A: **Per losing side, split evenly with rounding up.** `count=2` → 1+1; `count=3` → 2+1 (leftover goes to seat1). A doubles losing side pays the same total as a singles loser would; each loser carries their fair share on their tab.

Spec 013 shipped the match-agreement → match-settlement flow. Spec
017 shipped the home redesign that puts log/balance/settle on one
screen. This spec ties the two together: when a "for beer" match
settles, the home of the affected members reflects it, and the
consumption ledger ends up consistent with the visible state. After
018 ships, the four-flow home is complete: log, balance, bet
awareness, settle.

## Personas *(mandatory — constitution v1.4.0)*

- **P1 — Pavel, 45 · Wednesday-night doubles** *(primary)*: Plays
  for beer every Wednesday. Currently the match flow ends and he
  has to remember to go log the beer he owes — a manual step the
  system could trivially handle. He is the persona this spec
  exists for. Direct quote (panel, 2026-05-26): "the system knows
  I lost the match. Why not auto-create the consumption rows and
  put them on my tab the moment the match is settled?"
- **P2 — Tereza, 34 · iPhone · bilingual**: The awareness
  persona. Won't open `/bet`; needs to see her obligation on
  `/`. Wants the inline row with clear copy.
- **P3 — Standa, 67 · Czech only · stock manager (member role
  for matches)** *(canary)*: Won't tap any optional confirmation
  button — if the system makes it optional, he forgets. If the
  system makes it automatic, he just needs visible confirmation
  ("útrata z dnešního zápasu") in Czech, no nag tone, no
  "dlužíš".
- **P4 — Jiří, 58 · treasurer · Czech only**: The data /
  reversal persona. He does NOT use home; he uses
  `/admin/pending` and `/tab` views. But the data ledger has to
  satisfy his constraints: bet-linked consumptions must be
  distinguishable from regular drinks (his quote: "I need to see
  which consumptions came from bets in case of dispute"), and
  voiding a match must atomically void the linked consumption +
  transfer rows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Loser sees the bet obligation on home, resolves in ≤1 tap (Priority: P1)

A member has just lost a "for beer" match agreement. The
match-settlement transaction has already created the bet-linked
consumption (on the winner) + bet_transfer rows (cost to the
loser); the loser's tab reflects the obligation immediately. The
loser opens `/`, sees a passive "útrata z dnešního zápasu: 2× pivo"
notification with a visible undo affordance (active during the
existing consumption-undo window). They do not have to confirm or
tap anything for the ledger to be correct.

**Why this priority**: This is the flow the user named as core
concern #3 in the 2026-05-26 panel. Without it, the four-flow
home is incomplete and bet-linked consumptions silently never get
recorded. Same priority as the spec-017 one-tap log.

**Independent Test**: Settle a match agreement with member L as
loser and W as winner, for-beer = true, `match_loser_beer_count`
= 2. Open `/` as L. The home renders a bet-obligation row with
the source-match reference and the bet count. Under Option A
(auto-create) L's tab already includes the new bet-linked
transfer entries by the time the page renders; W's drink history
already includes the new consumption(s); voiding the match
removes both atomically.

**Acceptance Scenarios**:

1. **Given** a settled "for beer" match agreement with the
   current user as loser, **When** they open `/`, **Then** the
   home renders a bet-obligation module with the source-match
   reference and the bet count.
2. **Given** the loser's bet-obligation module rendered on home,
   **When** the loser taps "Vrátit" / "Undo" within the
   consumption-undo window, **Then** the bet-linked consumption
   + transfer rows are voided atomically, the balance returns to
   its pre-match value, and the module disappears (or shifts to
   a "vráceno" state).
3. **Given** an owing balance that came from a bet, **When** the
   loser views `/tab`, **Then** the bet-linked entries are
   visually distinguishable (e.g. small "ze zápasu" subtitle or
   icon) from regular drinks.
4. **Given** a match that has been settled and the loser has
   resolved (or auto-resolution has run), **When** the treasurer
   voids that match, **Then** in a single transaction the match
   is voided, the bet-linked consumption rows are voided, the
   bet_transfer rows are voided, and the loser's balance returns
   to its pre-match value.

---

### User Story 2 — Winner's record is correct without their action (Priority: P1)

A member has won a "for beer" match. After settlement, their
drink history shows the N consumption rows that represent the
beers the loser owes them, and the costs are correctly transferred
away from the winner. The winner does not have to confirm
anything to make their tally correct (or, in Option C from
clarify, they DO get a one-tap claim — same priority either way).

**Why this priority**: Same as US1 — the data has to be right on
both sides of the match for the ledger to balance. Mis-attributing
the consumption (no transfer) would leave the winner appearing to
owe for the beer.

**Independent Test**: Settle a "for beer" match. Open `/tab` as
the winner. The N new consumption rows are present but their
balance impact is zero (the matching transfers have moved the
cost to the loser). Open `/` as the winner. There is NO settle
CTA for the bet-linked consumption — it's not the winner's tab.

**Acceptance Scenarios**:

1. **Given** a settled "for beer" match with the current user as
   winner, **When** they open `/`, **Then** they may see a small
   passive indicator of the bet ("výhra · 2× pivo na účet
   Pavla") or nothing at all (Option A) — but never a settle CTA
   for the bet-linked consumption.
2. **Given** the same state, **When** the winner views `/tab`,
   **Then** the bet-linked consumption rows are visible in their
   drink history but their balance is unaffected (transfers
   offset the cost).

---

### User Story 3 — Treasurer can audit and void (Priority: P2)

The treasurer needs to know which consumption rows came from a
match (vs. regular drinks logged at the bar). They also need a
one-action way to void a match that cascades to the linked
consumption + transfer rows.

**Why this priority**: The constitution-V guardrail persona —
without this the audit trail breaks when results are disputed.
P2 because the data model already supports the cascade (just
needs wiring); the UX surface is small.

**Independent Test**: As treasurer, view the audit view of a
member who has both regular consumption and bet-linked
consumption. The two types are visually distinguishable. Void the
match; the linked rows are voided in the same transaction.

**Acceptance Scenarios**:

1. **Given** a member with a mix of regular and bet-linked
   consumptions in their tab, **When** the treasurer views the
   member's balance audit view, **Then** the bet-linked rows are
   tagged with the source match (e.g. clickable "ze zápasu →"
   link to the match page).
2. **Given** a settled match with bet-linked consumption rows,
   **When** the treasurer voids the match (via the existing
   match-void action), **Then** the consumption rows and
   bet_transfer rows are voided in the same transaction, the
   loser's balance returns to its pre-match value, and the audit
   view shows the voided state with `voided_at` timestamps.

---

### Edge Cases

- **No open drink_session when the match settles.** The
  bet-linked consumption needs a session. Assumption: reuse the
  existing auto-open-session path (the same mechanism `logBeer`
  uses today — see spec 017 plan, US1) so the match-settlement
  transaction opens a session if needed.
- **The match was a draw (no winner / no loser).** Out of scope —
  the existing match agreement flow doesn't support draws for
  "for beer" matches; if it did, no bet-linked rows would be
  created.
- **Multiple matches settled in the same session before the
  loser opens the app.** Under Option A each settlement is its
  own atomic transaction; the consumption rows exist regardless
  of when the loser opens the app. The home module summarises
  all bet-linked consumption from the open session into a
  single row ("4× pivo z dnešních zápasů") — count + brief
  source link, not per-match per-row.
- **The loser's balance includes both bet-linked consumption AND
  regular drinks.** The home balance sentence (spec 017)
  continues to show the COMBINED total — that is the correct
  representation of what they owe. The bet module is informational
  and complements the balance, not replaces it.
- **The winner has never logged a beer before (no predictive
  default for the auto-created consumption).** Resolved in
  clarify Q2 — see also the Assumptions section.
- **Doubles match (4 players, 2 per side).**
  `match_loser_beer_count` is the total per losing SIDE; split
  evenly across the two losers with rounding up if odd. `count=2`
  → loser1 owes 1, loser2 owes 1. `count=3` → loser1 (seat1) owes
  2, loser2 owes 1. A doubles loser pays the same total as a
  singles loser; each gets their fair share on their tab.
- **A bet-linked consumption itself getting voided directly (not
  via the match-void path).** Voiding a single bet-linked row
  must also void the corresponding bet_transfer row; otherwise
  the loser's balance would be wrong. Assumption: the existing
  `voidConsumption` action already cascades to bet_transfers
  through the source_consumption_id FK; spec 018 verifies this
  on the new bet-linked path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a "for beer" match is settled, the
  match-settlement server action MUST create — in the same
  database transaction that records the `match` row — the
  consumption rows on the winner side and the `bet_transfer`
  rows moving the cost to the loser side, totalling
  `match_loser_beer_count` per losing side (see assumption on
  doubles split). The creation is atomic with the match insert:
  a failure in any step rolls back all of (match,
  match_bet_transfer, bet_transfer, consumption) — no partial
  settlement.
- **FR-002**: The loser's home screen MUST render a clear,
  Czech-or-English-sentence-not-label module summarising any
  open or recently-resolved bet obligations from the active
  club. The module MUST NOT use the word "dlužíš" or English
  accusatory equivalents.
- **FR-003**: The winner's home screen MUST NOT render a settle
  CTA for the bet-linked consumption rows. The bet is on the
  loser's tab, not the winner's.
- **FR-004**: Bet-linked consumption rows MUST be visually
  distinguishable from regular consumption rows on every screen
  where a member's drinks are listed (`/tab`, `/account/payments`
  for the treasurer, etc.). The distinction MAY be a small
  subtitle ("ze zápasu"), a link to the match page, or a tag
  badge — exact treatment is part of the implementation, but the
  data MUST carry enough information for the UI to render it.
- **FR-005**: The match-void action MUST atomically void (a) the
  match row, (b) all linked bet_transfer rows, and (c) all
  consumption rows referenced by those transfers'
  `source_consumption_id`. A failure in any step MUST roll back
  the entire void (no partial state). After void, the loser's
  balance MUST return to its pre-match value.
- **FR-006**: The beer type used for the auto-created
  consumption MUST default to the winner's last-logged beer
  (reuse spec-017's `lastBeerForMember`). When the winner has no
  consumption history in this club, the fallback MUST be the
  cheapest in-stock beer (lowest `unit_price_minor` from active,
  non-archived beer types with `current_stock > 0`). If no
  in-stock beer is available, the match-settlement action MUST
  fail loudly (the club has no beer to bet on — admin must
  restock).
- **FR-006a**: The match-result-recording UI MUST expose an
  optional beer-type picker, defaulted to the FR-006 choice.
  The person submitting the result (winner or loser, per the
  existing spec-013 result-recording UX) can override the
  default by picking a different non-archived in-stock beer
  before submitting. The override is captured at submission
  time and used in the same match-settle transaction — no
  post-settlement beer-change path exists.
- **FR-007**: If no open drink_session exists in the club when
  the match settles, the system MUST auto-open one using the
  same mechanism `logBeer` uses today (see spec 017 plan). The
  bet-linked consumption rows are then attached to that session.
- **FR-008**: The home module that surfaces the bet obligation
  MUST resolve within the same render path as the spec-017
  balance + one-tap-log render. No additional client-side
  fetches; folded into the existing home-page query path.
- **FR-009**: If multiple unresolved match obligations exist for
  a single member, the home module MUST aggregate them into a
  single visual element (count + total) OR render them as
  distinct rows — the implementation chooses; the constraint
  here is that the home doesn't become visually crowded.
- **FR-010**: Bet-linked consumption rows MUST carry enough
  back-reference data to follow the chain match → match_agreement →
  match_agreement_side. This is needed for the "from yesterday's
  match" UI hint and for Jiří's audit view.
- **FR-011**: Every user-facing string introduced by this spec
  MUST resolve through the next-intl catalog in both `cs` and
  `en` (constitution: `i18n:check` gate).
- **FR-012**: All new DB rows created by this spec MUST carry
  `club_id` (Constitution II). Queries MUST filter by `club_id`
  to prevent cross-club leakage.

### Key Entities *(existing — nothing new in v1)*

- **MatchAgreement** *(existing — spec 013)*: The pre-match
  contract. `forBeer` flag determines whether the match settles
  into a bet.
- **Match** *(existing — spec 013)*: The settled outcome. Has
  `winnerMemberId`, `loserMemberId`, `agreementId`.
- **MatchBetTransfer** *(existing — spec 013)*: Link table
  joining a match to its bet_transfer rows.
- **BetTransfer** *(existing — spec 013)*: Moves the financial
  weight of a `source_consumption_id` from `from_member_id` to
  `to_member_id`.
- **Consumption** *(existing)*: Append-only drink log. Bet-linked
  ones are regular rows with a referencing bet_transfer.
- **BetTransferVoid / ConsumptionVoid** *(existing)*: Cascade
  void support.

No new entities or schema changes. The bet-linked consumptions
are regular `consumptions` rows; the back-link to the match
flows through `bet_transfers.source_consumption_id` and the
existing `match_bet_transfers` link table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a settled "for beer" match, the loser's home
  reflects the obligation within the first render — they do NOT
  have to open `/bet` to find out they owe a beer.
- **SC-002**: The loser sees the result of the bet on home with
  zero taps required (the match-settlement transaction has
  already created the rows). Undoing the bet lives on the
  match page (`/match/{id}`) where the existing reverse-result
  UI sits; reaching it from home is **one tap** (the "Vrátit
  zápas" link in the home module), with the actual reversal
  one additional tap on the match page.
- **SC-003**: The data ledger is consistent end-to-end: for
  every settled "for beer" match, the count of
  `match_bet_transfer` rows equals the count of `bet_transfer`
  rows equals the count of bet-linked consumption rows. Verified
  by integration test that runs the settle → assert chain.
- **SC-004**: Voiding a settled "for beer" match atomically
  voids all related rows (match + transfers + consumptions).
  Verified by integration test. No partial-void state ever
  observable.
- **SC-005**: Treasurer can identify bet-linked consumptions in
  any view that lists consumption rows (at minimum: the audit
  view at `/admin/balances/[memberId]` and the
  `/tab` history). 100 % of bet-linked rows render the
  source-match link.
- **SC-006**: A panel re-run with the four personas confirms
  that the loser hears about the obligation on home (Pavel,
  Tereza, Standa) and that the audit story holds (Jiří). The
  pre-condition to mark this spec Shipped is at least 3-of-4
  positive responses, same as spec 017's SC-006.

## Assumptions

- The existing `match_bet_transfers` table + `bet_transfers`
  table + the existing match-void atomicity (FR-005 above) are
  the right primitives. This spec wires them to the home
  surface and (depending on clarify Q1) may add a small
  pending-obligation marker.
- The home-page query path established in spec 017
  (`memberBalance` + `lastBeerForMember`) is extended to also
  fetch unresolved bet obligations in the same parallel
  `Promise.all`. One extra round-trip at most, per Principle II
  and matching SC-005 of spec 017.
- Doubles split: each loser owes `match_loser_beer_count /
  losing_side_size` beers; the integer division rounds up if
  needed (e.g. `count=3` → side of 2 → 2+1 beers respectively).
  Open for clarify if the user prefers a different split.
- The bet module's wording in Czech avoids "dlužíš" per the
  2026-05-26 user direction. Working candidates:
  "Útrata z dnešního zápasu: 2× pivo" / "Z výhry: 2× pivo na
  účet Pavla" / "Vyrovnat sázku ze zápasu →". Final wording
  lives in the i18n catalog.
- Out-of-scope items from the input prompt
  (match-agreement-creation UX, non-match bets, multi-club,
  log-for-another-member, role-aware home modules) remain
  deferred to their own specs. This spec changes ONLY the
  match-settlement transaction and the home render path.
- The `logBeer` server action (spec 017) is the model for
  atomic-and-audit-safe consumption creation. The bet-linked
  consumption creation MUST share its invariants
  (session-attached, stock-decremented if applicable, audit
  trail).
- The match-settle action's existing transaction is the
  natural insertion point for Option A's auto-creation. Option
  B would add a new "accept bet" server action.
