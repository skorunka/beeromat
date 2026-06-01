# Feature Specification: Beer Breakdown on the Tab

**Feature Branch**: `028-tab-beer-breakdown` (spec dir only — shipped trunk-based on `main`)

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: at settle time a bare total is uninformative — "seeing 'I had 3 Pilsners for 120 Kč' is more worth"; group the tab's logged beers by beer type (and date) so the member recognises their bill before paying.

## Clarifications

### Session 2026-06-01

- Q: Which screen(s) get the breakdown? → A: /tab only (My tab); /settle + /history deferred to BACKLOG.
- Q: Breakdown vs the existing chronological list? → A: Add the breakdown alongside; keep the chronological list and its per-beer Undo.
- Q: Group sort order? → A: Biggest subtotal first; multi-day rounds newest day first.
- Q: A bet-picked-up beer in the breakdown? → A: Grouped under its beer type by name (no separate "from bets" group).

### Session 2026-06-01 (refinement)

The breakdown is for the daily play-tennis-and-drink habit, not an abstract "round". Revised:

- **Primary surface is HOME (the landing page)**, not /tab. After logging from home, the member sees this evening's running breakdown and a prominent quick-settle button to call it a day. (/tab keeps the same breakdown component as a secondary surface; the helper is shared.)
- **Group and head by the actual DAY** (weekday name + date, e.g. "pondělí 1. 6."), always shown — each day section is one tennis evening. If the member doesn't settle before leaving and returns another day, the breakdown shows per-day sections (newest first).
- **Lost-bet beers are a distinct origin** within the day (NOT merged into the drank count — this supersedes the earlier Q4 answer). They render with a dice icon + a "lost bet" note so the member sees "you pay for this but didn't drink it". They still count toward the day subtotal and the grand total.
- Within a day: drank beers first, then lost-bet beers, each by subtotal desc.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Beer breakdown before settling (Priority: P1)

Standa finishes the evening and opens his tab to pay. Instead of only a grand total, he sees a short breakdown: "Pilsner Urquell ×3 · 120 Kč", "Bernard 10° ×2 · 60 Kč" — and the same 180 Kč grand total he saw before. He recognises his evening, trusts the number, and settles. The full chronological list of individual beers (with Undo still available on his most recent one, within the window) remains below the breakdown.

**Why this priority**: This is the whole feature — turn an opaque total into a recognisable, verifiable bill at the moment of payment, which is when it matters most.

**Independent Test**: With a tab containing several beers of two or more types, the tab screen renders one breakdown group per beer type showing the type name, the count, and the subtotal; the breakdown's grand total equals the existing tab total; the chronological line-item list is still present below.

**Acceptance Scenarios**:

1. **Given** a member who has logged 3 Pilsner and 2 Bernard this round, **When** they open their tab, **Then** they see a breakdown with "Pilsner ×3 · 120 Kč" and "Bernard ×2 · 60 Kč", and a grand total of 180 Kč.
2. **Given** that breakdown, **When** the member reads it, **Then** the sum of all group subtotals equals the tab total shown elsewhere on the screen.
3. **Given** the breakdown is shown, **When** the member looks below it, **Then** the existing chronological line-item list is still present and the most recent beer (within the undo window) still offers Undo.
4. **Given** a round that spans more than one calendar day, **When** the member opens their tab, **Then** the breakdown groups per (beer type, day) so each day's beers are counted separately, newest day first.

---

### User Story 2 - Empty / single-beer tab (Priority: P2)

A member who has logged nothing this round sees the existing empty-tab state and no breakdown. A member with exactly one beer sees a single-row breakdown ("Pilsner ×1 · 40 Kč") — degenerate but correct, not hidden.

**Why this priority**: Boundary correctness — the breakdown must not render a confusing empty block, nor special-case away the trivially-small tab.

**Independent Test**: With zero countable beers, no breakdown section renders. With exactly one, a single group renders with count 1.

**Acceptance Scenarios**:

1. **Given** a member with no logged beers this round, **When** they open their tab, **Then** no breakdown section is shown (the existing empty state stands).
2. **Given** a member with exactly one beer, **When** they open their tab, **Then** the breakdown shows one group with a count of 1 and a subtotal equal to that beer's price.

---

### User Story 3 - Bet-adjusted correctness (Priority: P2)

Honza loses a for-beer match and picks up Mara's beer; Mara (the winner) auto-logged a beer that moved to Honza. On Honza's tab the picked-up beer appears in its beer-type group (he owes it). On Mara's tab that beer does NOT appear (she won it away). Each member's breakdown subtotals still sum to their own tab total.

**Why this priority**: The breakdown must reflect what the member actually OWES, not a naïve "beers I personally tapped." If it diverged from the balance, it would erode the exact trust the feature is meant to build.

**Independent Test**: After a for-beer settlement, the winner's breakdown excludes the transferred-away beer and the loser's includes the transferred-in beer; both breakdowns sum to their respective tab totals.

**Acceptance Scenarios**:

1. **Given** a member who won a for-beer bet (their beer transferred away), **When** they open their tab, **Then** the transferred-away beer is absent from the breakdown and the breakdown total equals their (reduced) tab total.
2. **Given** a member who lost a for-beer bet (a beer transferred to them), **When** they open their tab, **Then** the picked-up beer is counted in its beer-type group and the breakdown total equals their (increased) tab total.
3. **Given** any member, **When** the breakdown is computed, **Then** voided beers are excluded from every group and from the grand total.

---

### Edge Cases

- **No countable beers**: no breakdown section (US2).
- **Single beer**: one group, count 1 (US2).
- **Voided beer**: excluded from its group and the total (US3 #3).
- **Won-away beer (transfer_out)**: excluded (US3 #1).
- **Picked-up beer (transfer_in)**: included in its beer-type group (US3 #2).
- **Multi-day round**: grouped per (type, day), newest day first (US1 #4).
- **Two beer types at the same price**: stay distinct groups (grouping is by type name, not price).
- **Invariant**: the breakdown grand total always equals the tab's existing total — there is no path where they disagree.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tab screen MUST display a breakdown of the member's countable beers for the current round, grouped by beer type (and by calendar day when the round spans multiple days).
- **FR-002**: Each breakdown group MUST show the beer type name, the count of beers in that group, and the subtotal (count × price) for that group.
- **FR-003**: The breakdown MUST count only beers the member effectively owes for the round: self-logged-and-still-held beers and beers transferred TO the member from a lost bet; it MUST exclude beers transferred AWAY (won bets) and voided beers.
- **FR-004**: The sum of all breakdown group subtotals MUST equal the tab's existing grand total for the round.
- **FR-005**: The breakdown MUST be shown IN ADDITION TO the existing chronological line-item list; the per-beer Undo affordance on the chronological list MUST remain functional.
- **FR-006**: When the member has no countable beers, the breakdown section MUST NOT render (the existing empty-tab state stands).
- **FR-007**: Breakdown groups MUST be ordered by subtotal descending (largest spend first); when the round spans multiple days, days MUST be ordered newest first, with each day's groups ordered by subtotal descending within the day.
- **FR-008**: A beer transferred to the member from a bet MUST be grouped under its beer type by name (not split into a separate "from bets" group); origin remains visible in the chronological list.
- **FR-009**: All new member-facing copy (the breakdown heading and the per-group line with its count) MUST be available in Czech and English, with Czech as the primary language and correct Czech plural forms for the count.
- **FR-010**: The breakdown MUST be derived from the same tab data already loaded for the screen; it MUST NOT trigger an additional data fetch or require a schema change.

### Key Entities *(include if feature involves data)*

- **Tab entry (existing)**: one line of the member's tab for the round — carries the beer type name, the price, the timestamp, whether it is voided, and its kind (a self/on-behalf consumption, a beer picked up from a bet, or a beer won away). The breakdown is computed over this existing list; no new entity.
- **Breakdown group (derived, not persisted)**: a (beer type name, day) bucket with a count and a subtotal, produced by aggregating the countable tab entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member reviewing their tab can identify how many of each beer type they are paying for, and the cost of each type, without reading the individual line items.
- **SC-002**: The breakdown grand total equals the tab total 100% of the time (no scenario produces a mismatch), including after bet wins/losses and voids.
- **SC-003**: A high-volume tab (e.g. 10 beers across 2 types) is summarised in a breakdown of at most one row per (type, day), rather than requiring the member to scan every line.
- **SC-004**: The breakdown never hides or distorts what the member owes — the same total, just itemised by beer.

## Assumptions

- **Q1 → /tab only**: The breakdown ships on the My-tab screen only for this spec. The /settle screen (whose outstanding balance may span multiple unsettled sessions) and the /history session-detail read view are deferred follow-ups (BACKLOG).
- **Q2 → add, don't replace**: The breakdown is added as a summary section; the existing chronological line-item list (and its per-beer Undo) is kept. Grouping alone would destroy per-beer undo.
- **Q3 → largest spend first**: Groups are ordered by subtotal descending; multi-day rounds order days newest-first. Reflects "what's driving my bill."
- **Q4 → transfer-in grouped by type**: A picked-up bet beer joins its beer-type group rather than a separate "from bets" group; the chronological list already conveys origin.
- The breakdown is scoped to the current round's tab, not the member's full outstanding balance across sessions.
- No treasurer/admin per-member breakdown in this spec.
- "Effective consumption" is exactly what the existing tab total already represents — the breakdown is a re-presentation of it, so the two cannot disagree by construction.
