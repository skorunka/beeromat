# Feature Specification: Log a beer on behalf of another member (v1.13)

**Feature Branch**: direct-to-`main`, trunk-based.

**Created**: 2026-05-26

**Status**: Implemented 2026-05-26 — code written, gates pending (node went missing mid-session). All Phase 2-5 tasks done; gates + manual quickstart deferred until node binary is re-findable on the host.

**Input**: User description: "Log a beer on behalf of another member.
When someone forgets their phone, a mate logs the beer for them."

## Clarifications

### Session 2026-05-26

- Q: Where does the on-behalf affordance live? → A: **Option A — Home link + /log catalog.** A small "Log for someone else" link sits below the home one-tap button AND at the bottom of the /log catalog grid. Two surfaces (the screens members already use for logging); the link opens the member-picker → beer-picker flow.
- Q: Does the absent member need to explicitly confirm the log before it counts? → A: **Option C — insert immediately + prominent home banner.** Consumption is created on insert (full balance + stock impact, same as a self-log). On the absent member's next home render a banner surfaces every unreviewed on-behalf log with a one-tap "Vrátit" reject. Default action if they ignore: keep. No new "pending" schema state.
- Q: What are the reject-path semantics when the absent member taps "Vrátit"? → A: **Option α — void + restore stock; nobody pays.** Reuses the existing `voidConsumptionAction` cascade (insert `consumption_voids`, `current_stock += 1`, write `stock_changes` audit row). The original logger's user id stays on `created_by_user_id` so Jiří can audit patterns; no automatic cost transfer to the logger (would feel adversarial between friends). The club absorbs the rare "beer drunk but reject-voided" cost.
- Q (user follow-up): What row distinctions are needed on /tab? → A: **Four row types, all visually distinguishable.** (1) Self-logged consumption — no badge. (2) On-behalf consumption — small "od {logger}" subtitle. (3) Won-bet consumption (winner's tab) — existing "ze zápasu →" subtitle from spec 018. (4) Lost-bet transfer (loser's tab, NEW kind: `transfer_in`) — distinct row showing "z prohrané sázky · 50 Kč" + link to source match. Spec 019 expands /tab beyond just consumption entries; bet transfers TO the member now surface as their own row kind so the balance line-items match the balance total. Constitution V — "reversibility is a UI property": the loser's tab today shows nothing for bet-linked costs, only the impact on the total — that breaks the audit story for Standa.

After spec 017 (one-tap log on home) and spec 018 (match-bet → home
awareness) the daily log flow is fast and frictionless — but only
for the signed-in member. The group-at-the-bar scenario where one
member's phone is dead is still unsupported. Today's workaround:
ask the absent member to log it later (forgotten) or do nothing
(unrecorded beer, lost revenue for the club). Pavel's direct quote
during the spec-017 panel: "sometimes I'm logging for Honza because
his phone died. There's no UI for that today."

This spec adds a UI path for a present member to log a beer on
behalf of another member of the same club. The absent member gets
visibility + a reject path; the treasurer gets an audit trail
distinguishing self-logged from logged-on-behalf.

## Personas *(mandatory — constitution v1.4.0)*

- **P1 — Pavel, 45 · Wed-night doubles** *(primary)*: The
  persona this spec exists for. He's the one logging on behalf
  of Honza at the bar when phones die. Wants the log to take ≤ 2
  taps in his already-fast flow.
- **P2 — Tereza, 34 · iPhone · bilingual** *(present actor
  convenience)*: Would use the feature occasionally for friends.
  Expects it to feel like a natural extension of spec 017's
  one-tap log — minimal new UI to learn.
- **P3 — Standa, 67 · Czech only · stock manager** *(absent-member
  canary)*: When he opens the app and sees "Pavel logged Kozel
  for you", the message must be a clear Czech sentence (no
  "dlužíš"), and the reject path must be obvious. Standa is the
  reason this spec spends words on the absent-member side of the
  flow.
- **P4 — Jiří, 58 · treasurer · Czech only** *(audit persona)*:
  Needs to tell apart self-logged from logged-on-behalf rows when
  resolving disputes. "Honza says he didn't drink the third
  Pilsner — who logged it?" → answer must be visible to Jiří in
  the admin balance view.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Present member logs a beer for an absent member (Priority: P1)

A present member taps the on-behalf affordance, picks the absent
member, picks the beer (with a predictive default), and confirms.
A consumption row appears on the absent member's tab, attributed
to the present member as the logger.

**Why this priority**: This is the core flow the spec exists to
enable. Without it, the spec doesn't have a feature.

**Independent Test**: As Pavel, open the app and use the on-behalf
flow to log a Pilsner for Honza. Verify a `consumptions` row
exists with `member_id = Honza` and `created_by_user_id = Pavel`.

**Acceptance Scenarios**:

1. **Given** a present member with at least one other member in the
   active club, **When** they invoke the on-behalf affordance,
   **Then** they see a member-picker scoped to the active club's
   active members (excluding themselves).
2. **Given** the present member has picked a target absent member,
   **When** they pick a beer (from the catalog or via the
   predictive default), **Then** a consumption row is created
   with `member_id = absent member`, `created_by_user_id =
   present member`, and `unit_price_minor_snapshot =
   beer.unit_price_minor` (same shape as a self-log).
3. **Given** the present member has just logged a beer on behalf
   of another, **When** the action returns success, **Then** a
   toast confirms the log ("Zapsáno · Pilsner pro Honzu") and
   the action returns within 500 ms — mirrors spec 017's
   one-tap-log feedback.
4. **Given** the present member tries to invoke the affordance in
   a club with only themselves as an active member, **When** the
   page renders, **Then** the affordance is hidden or shows an
   empty-state message — there is no one to log for.

---

### User Story 2 — Absent member sees + reviews on-behalf logs (Priority: P1)

When the absent member next opens the app, their home surfaces
the on-behalf logs created since their previous visit. They can
accept (keep the consumption) or reject (void it) in one tap.

**Why this priority**: Without visibility + reject, the absent
member has no recourse against a mistaken or malicious log, and
the data is opaque. Constitution V (reversibility is a UI
property, not only a data property) requires this.

**Independent Test**: Have Pavel log 2 Pilsners on behalf of
Honza. Open `/` as Honza. The home renders a visible review
banner listing the two on-behalf logs with their reject affordances.

**Acceptance Scenarios**:

1. **Given** the absent member has unreviewed on-behalf
   consumptions, **When** they open `/`, **Then** the home renders
   a review module (similar to spec 018's `MatchBetModule`) with
   the count + the logger name + the beer name(s).
2. **Given** the absent member is reviewing an on-behalf log,
   **When** they tap reject, **Then** the consumption is handled
   per the Q3 reject-path semantics (resolved in /speckit-clarify).
3. **Given** the absent member is reviewing an on-behalf log,
   **When** they tap accept (or implicitly leave it), **Then** the
   consumption stays on their tab and counts in their balance.

---

### User Story 3 — Treasurer can audit self vs. on-behalf (Priority: P2)

The admin balance audit view (`/admin/balances/[memberId]`) shows
who logged each consumption — the consumer's own user, or another
member acting on their behalf. The same distinction surfaces on
the /tab view of the consumer if relevant.

**Why this priority**: Jiří's dispute-resolution path. P2 because
the data already exists (`consumptions.created_by_user_id`); this
is UI surfacing, not new schema.

**Independent Test**: After Pavel logs on behalf of Honza, open
`/admin/balances/Honza` as Jiří. The row for the on-behalf
consumption shows "logged by Pavel" or similar attribution.

**Acceptance Scenarios**:

1. **Given** a member has consumptions logged by themselves AND
   by another member on their behalf, **When** the treasurer
   opens the audit view, **Then** the on-behalf rows are visually
   distinct (e.g., small "od Pavla" subtitle) and the self-logged
   rows are not annotated.

---

### Edge Cases

- **The target absent member is currently signed in on another
  device.** No special handling — the consumption appears on
  their tab on the next render. They can review it from any
  device they unlock.
- **The present member logs for themselves via the on-behalf
  flow** (picks themselves as the target). The affordance MUST
  filter the picker to exclude the present member — there is no
  meaningful difference between "log for me via on-behalf" and
  "log for me via the regular one-tap button". Picker excludes
  self.
- **The present member logs on behalf of a member who is later
  removed from the club.** The consumption stays; the void path
  per Q3 still applies. Future cleanup is a separate concern.
- **Two present members log on behalf of the same absent member
  in quick succession.** Both consumptions are created in order;
  the home review banner aggregates them. Standard Constitution V
  void-individually behavior applies.
- **The absent member opens the app and reviews ONE on-behalf
  log out of three.** Two remain in the review state; the home
  banner count drops to 2. No bulk-action affordance in v1.
- **The on-behalf log is voided.** Stock is restored same as
  `voidConsumptionAction` (the absent member's beer "is not
  drunk after all"). The original logger is NOT proactively
  notified in v1 — they see the void on the absent member's tab
  if they look. A future spec can add notifications to the
  logger (push / banner on home) if patterns of repeated voids
  emerge.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a "Log for someone else"
  text link on TWO surfaces: (a) below the home one-tap button
  on `/`, and (b) below or alongside the catalog grid on
  `/log`. Both links route to the on-behalf flow (member-picker
  → beer-picker → confirm).
- **FR-002**: When a present member logs a beer on behalf of an
  absent member, the resulting `consumptions` row MUST have
  `member_id = absent member`, `created_by_user_id = present
  member's user id`, and otherwise identical shape to a
  self-logged consumption (price snapshot, session, stock
  decrement, audit row).
- **FR-003**: The member-picker MUST exclude the present member
  themselves (the regular one-tap log is the path for self-logs).
- **FR-004**: The member-picker MUST scope to the active club's
  ACTIVE members (excluding archived/inactive members).
- **FR-005**: The absent member's home (`/`) MUST render a
  review banner listing every unreviewed on-behalf consumption
  created since their last review action. The banner shows the
  logger's display name + the beer name + a one-tap "Vrátit"
  reject. The consumption itself was created on insert (full
  balance + stock impact at log time) — the banner is a
  proactive surfacing, not a confirmation gate. Default action
  if the member navigates away without interacting: keep.
- **FR-005a**: An "unreviewed on-behalf consumption" is a
  consumption row where `created_by_user_id <> consumer's
  user_id`, not voided, and the consumer has not yet visited
  the review banner since it was created. Tracking the
  "reviewed" boolean requires either (a) a small new column on
  `consumptions` (e.g. `on_behalf_reviewed_at`) OR (b) a
  separate `consumption_acks` table. Decision deferred to
  plan.md (data-model section); functionally either approach
  satisfies this requirement.
- **FR-006**: The absent member MUST be able to reject an
  on-behalf consumption from the home review module in ≤ 1 tap.
  Reject is a void: the system inserts a `consumption_voids`
  row, restores the beer's `current_stock` by 1, and inserts a
  `stock_changes` audit row. The original logger
  (`created_by_user_id`) is preserved on the consumption row for
  audit. No automatic cost transfer happens — the club absorbs
  the rare "beer drunk but reject-voided" cost. The reject
  action MUST be available indefinitely (no undo window) as long
  as the consumption has not yet been voided.
- **FR-007**: On every screen that lists consumption-or-transfer
  rows for a member (`/tab`, `/admin/balances/[memberId]`, any
  future history view), each row MUST visibly indicate which of
  the four origin types it is, so the member can answer "why is
  this on my tab":
    1. **Self-logged consumption** — no badge (the default).
    2. **On-behalf consumption** — small "od {logger display
       name}" subtitle.
    3. **Won-bet consumption** (winner's tab) — small
       "ze zápasu →" subtitle linking to the source match.
       (Already shipped by spec 018 follow-up; this spec
       inherits.)
    4. **Lost-bet transfer** (loser's tab) — a new row kind
       (`transfer_in`) showing the source beer name + "z
       prohrané sázky" + link to the source match. The row
       counts in the member's total just like a consumption.
- **FR-007a**: `/tab`'s row list MUST be ordered chronologically
  (newest first) across ALL four origin types — a single merged
  list, not separate sections per kind. Each row carries its own
  visual badge per FR-007.
- **FR-008**: Every user-facing string introduced by this spec
  MUST resolve through the next-intl catalog in both `cs` and
  `en` (constitution: `i18n:check` gate).
- **FR-009**: All new DB rows created by this spec MUST carry
  `club_id` (Constitution II). All queries that filter for
  on-behalf logs MUST also filter by `club_id` to prevent
  cross-club leakage.
- **FR-010**: The home review module MUST resolve within the
  existing home-page query path (one extra round-trip max), per
  the pattern set by spec 018's `matchBetSummaryForMember`.
- **FR-011**: Voiding an on-behalf consumption MUST restore the
  beer's stock + insert a `stock_changes` audit row, identical
  to the existing `voidConsumptionAction` path.

### Key Entities

- **Consumption** *(existing)*: An append-only row. Today,
  `created_by_user_id` always equals the consumer's user_id. After
  spec 019, the two can differ (the consumer is `member_id`'s
  user; the logger is `created_by_user_id`).
- **Member** *(existing)*: The picker is over `members WHERE
  club_id = $1 AND is_active = true AND id <> $present_member_id`.
- **ConsumptionVoid** *(existing)*: The reject path uses this
  for the void semantics (Q3 → Option α).
- **BetTransfer** *(existing — spec 013/018)*: The /tab loser's
  view (FR-007 row type 4) reads from `bet_transfers WHERE
  to_member_id = $1 AND not voided`.

Plan-side data-model decision (one item deferred to plan.md):
how to mark a consumption as "reviewed" by the absent member
(per FR-005a). Two viable shapes — a new `consumptions.on_behalf_reviewed_at`
nullable timestamp column, OR a separate `consumption_acks`
link table. Both satisfy the requirement; plan picks the simpler
one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A present member can complete an on-behalf log in
  ≤ 2 taps from cold-open of the home screen, mirroring spec
  017's "one-tap goal" with the added member-picker tap.
- **SC-002**: The absent member sees the on-behalf log on their
  home within the first render after the log was created — they
  do NOT have to navigate to `/tab` or `/history` to discover it.
- **SC-003**: 100 % of on-behalf consumption rows are visually
  distinguishable from self-logged rows on every consumption-list
  view (per FR-007). Verified by component test of the row
  rendering.
- **SC-004**: The reject path (per Q3 outcome) executes
  atomically — no partial state observable. Verified by
  integration test on the reject server-action.
- **SC-005**: After a reject, the absent member's balance returns
  to its pre-on-behalf value; stock is restored. (For option β:
  the original logger's balance changes by the moved cost
  instead.) Verified by integration test.
- **SC-006**: A panel re-run with the four personas confirms
  Pavel finds the affordance ≤ 5 seconds from cold-open, Standa
  understands the absent-member home banner in Czech without
  asking for help, and Jiří can identify on-behalf rows in the
  audit view at a glance. Qualitative; ≥ 3-of-4 positive
  responses required before marking shipped.

## Assumptions

- The active club has > 1 active member (the affordance is moot
  in a single-member club; an empty-state copy will cover it).
- The `consumptions.created_by_user_id` field already exists in
  the schema and was always intended to support this use case.
  Spec 019 makes it finally meaningful by allowing it to differ
  from the consumer's user_id.
- The on-behalf flow does NOT integrate with the match-bet flow
  (spec 018). Match-bets are a different concept; on-behalf logs
  are direct consumption attributions.
- Per Q1 resolution, the affordance will reuse spec 017's
  predictive-default helper (`lastBeerForMember`) for the beer
  picker — but with the ABSENT MEMBER's last beer, not the
  present member's. This matches the semantic "what would this
  person likely drink."
- The home review module will use the same component pattern as
  spec 018's `MatchBetModule` — server component, returns null
  when empty, V1/V2/V3 variants.
- The reject server-action is a new server action (e.g.,
  `voidOnBehalfConsumptionAction` or, more likely, just
  `voidConsumptionAction` with a guard that the actor is either
  the consumer or has treasurer override — already true today).
  The thing that's new is the affordance ON THE ABSENT MEMBER's
  home, not the action itself.
- Constitution v1.10.0 Principle VIII test layer split applies:
  integration tests for the new `logOnBehalfAction` + reject
  cascade; component tests for the affordance + the home review
  module; no E2E warranted (no new multi-system seam).
