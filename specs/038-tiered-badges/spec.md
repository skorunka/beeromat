# Feature Specification: Tiered badges (bronze / silver / gold)

**Feature Branch**: `038-tiered-badges` (authored on `main`, trunk-based)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Add bronze/silver/gold tiers to the count-based achievements so there's always a next level to chase. A tiered 'family' (e.g. Century Club: 100/250/500 beers) shows on the profile as one tile at the member's highest earned tier with progress to the next; tiers are cumulative + sticky; crossing a tier fires the existing 🍻 celebration. No schema change — tiers are just more catalog keys over the existing achievements table. Reuses spec 035 (achievements) + 037 (gallery/board)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Always a next level to chase (Priority: P1)

A member who already earned Century Club (100 beers) opens their profile and, instead
of a "done" badge with nothing more to do, sees **Century Club — Silver** with a
progress bar toward **Gold** ("372 / 500"). The count-based badges are now families
with three tiers (bronze → silver → gold); the gallery shows each family as a single
tile at the member's highest earned tier with the climb to the next one. A family the
member hasn't reached at all shows bronze, locked, with progress toward bronze.

**Why this priority**: This is the whole point — turning one-shot badges into an
ongoing chase. It's the visible payoff and the headline.

**Independent Test**: On a profile, a member at 372 beers shows the Century Club tile
at Silver with "372 / 500 → Gold"; a member at 80 beers shows it at locked Bronze with
"80 / 100"; a member at 600 shows Gold (max, complete).

**Acceptance Scenarios**:

1. **Given** a member with 372 beers (silver threshold 250 crossed, gold 500 not), **When** I open their profile, **Then** the Century Club tile reads Silver with progress toward Gold ("372 / 500").
2. **Given** a member at 80 beers (no tier yet), **When** I view the tile, **Then** it shows locked Bronze with progress toward the bronze threshold ("80 / 100").
3. **Given** a member at/above the top tier (e.g. 600 beers), **When** I view the tile, **Then** it shows Gold as complete (no further progress bar).
4. **Given** a tiered family, **When** rendered, **Then** there is ONE tile for it (not three separate rows), with a clear bronze/silver/gold cue + the tier name.

---

### User Story 2 - Earn the next tier in the moment (Priority: P2)

When a member's action crosses a tier threshold (logs the beer that makes 250, wins
the match that makes their 50th), the app recognises the new tier at that moment:
persists it, keeps the lower tiers, and celebrates with the existing 🍻 + a toast
naming the tier ("Century Club — Gold 💯"). The tier is then permanently theirs.

**Why this priority**: The escalating reward moment is what makes the chase feel alive;
depends on US1's tier model existing.

**Independent Test**: Drive a member from just-below to just-over a tier threshold via a
normal action and confirm the tier-up is celebrated once, the new tier shows on the
profile, lower tiers remain, and repeating doesn't re-celebrate.

**Acceptance Scenarios**:

1. **Given** a member at 249 beers (bronze held), **When** they log one more, **Then** the silver tier-up is celebrated and the tile advances to Silver; Bronze stays earned.
2. **Given** a member who just reached a tier, **When** they perform another qualifying-but-already-held action, **Then** no second celebration and no duplicate.
3. **Given** a member earns a tier, **When** a later event reverses the underlying stat (a voided beer drops them below the threshold), **Then** the tier is NOT revoked (sticky).
4. **Given** existing members on first release of tiers, **When** the system backfills, **Then** every member is granted all tiers they already qualify for (so a veteran immediately shows Silver/Gold), without needing a new action.

---

### Edge Cases

- **Cross multiple tiers at once**: a member who jumps from below bronze to above silver in one action earns both tiers (cumulative); the celebration names the highest reached (or each new one) without spamming.
- **Top tier reached**: the tile shows the max tier as complete, no "next tier" bar.
- **Never-reached family**: shows locked bronze + progress to bronze (never blank).
- **Stat reversal**: a voided beer / reversed match never strips an earned tier (sticky) and never advances a tier the member no longer qualifies for going forward (recognition only adds when the current stat qualifies).
- **Non-count badges**: win-rate (Sharpshooter) and the streak badges (Hat-trick / On Fire) are NOT tiered in v1 (they don't model as a simple count family); they render exactly as today.
- **"N of M" + filter/sort (spec 037)**: a tiered family counts as ONE toward the gallery's earned-of-total header (counted once at its highest tier, not three); the filter/sort still operate on the family tiles.
- **"Most badges" board (spec 037)**: continues to count held achievement records, so reaching higher tiers increases a member's badge count (depth is rewarded on the board) — consistent and intentional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The count-based badges MUST become tiered families with three levels (bronze / silver / gold), each level a higher threshold of the same underlying stat.
- **FR-002**: On the profile gallery, a tiered family MUST render as a SINGLE tile showing the member's highest earned tier and progress toward the next tier (or "complete" at the top tier; locked bronze with progress when none earned).
- **FR-003**: Tiers MUST be awarded cumulatively — reaching a higher tier does not remove lower tiers; all reached tiers are held.
- **FR-004**: An earned tier MUST be sticky — never revoked if the underlying stat later drops (consistent with the base achievements).
- **FR-005**: Crossing a tier threshold via a qualifying action MUST be recognised at that moment, persisted, and celebrated (existing 🍻 + a toast naming the new tier).
- **FR-006**: Re-performing an action for an already-held tier MUST NOT re-celebrate or duplicate it.
- **FR-007**: On first release, the system MUST backfill all tiers members already qualify for, so veterans immediately see their highest earned tier (no new action required).
- **FR-008**: Every tier's earn condition and progress MUST be derivable from a member's current aggregate statistics — no new point-in-time event capture.
- **FR-009**: Each tier MUST have human-readable name + description copy in Czech and English, in the playful-but-kind tone, with a clear tier cue (bronze/silver/gold).
- **FR-010**: This feature MUST NOT change the database schema — tiers are additional achievement keys over the existing achievements table.
- **FR-011**: A tiered family MUST count as ONE toward the gallery's earned-of-total header (at its highest tier), and the existing filter/sort (All/Earned/Locked, Default/Closest/Rarest) MUST continue to work over the family tiles.
- **FR-012**: Non-count badges (win-rate, streaks) MUST remain single-level in v1 and render unchanged.
- **FR-013**: Final tier thresholds MUST be chosen so each tier is reachable but meaningful on the real club data (not so high nobody reaches silver/gold, not so low everyone maxes immediately).

### Key Entities *(include if feature involves data)*

- **Badge family**: a group of escalating tiers over one stat (e.g. "beers"): bronze/silver/gold thresholds, shared emoji, per-tier copy. Defined in code (not the DB), extending the existing catalog.
- **Earned tier**: a persisted achievement record for a specific tier of a family (one per tier per member); reuses the existing achievements record shape (no new table/columns).
- **Member statistics** *(existing)*: the aggregate figures every tier's threshold + progress is computed from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a club with existing history, every tiered family on every profile shows the correct highest-earned tier and accurate progress to the next — zero wrong tiers, immediately after release (backfill complete).
- **SC-002**: A member crossing a tier via a normal action sees the tier-up celebrated within that action (no refresh), 100% of the time, and the tile then shows the new tier.
- **SC-003**: After a stat-reversing event, a previously-earned tier remains — 0% revocation.
- **SC-004**: Repeating a qualifying action never duplicates a tier or re-celebrates.
- **SC-005**: No database migration is introduced.
- **SC-006**: A member can tell at a glance, per family, what tier they hold and how far to the next — on a phone, one tile per family.

## Assumptions

- **Tiered families (v1)**: the six count-based badges — Century Club (beers), Winner
  (wins), Regular (matches), Round King (rounds), Night Owl (sessions), Connoisseur
  (distinct beer types). Sharpshooter (win-rate) and the streak badges (Hat-trick /
  On Fire) stay single-level (they don't model as a simple count family). Decided to
  keep v1 tight; revisit streak-as-family later.
- **Three tiers** (bronze/silver/gold); no prestige/infinite tiers in v1. Exact
  thresholds finalised in the plan against the heavy-seed distribution (the description's
  100/250/500 etc. are the starting point).
- **Each tier is its own persisted achievement key** over the existing table (e.g. a
  `family.tier` key) — additive in the code catalog, NO migration. The existing
  recognition/backfill ("award every catalog key the member qualifies for") grants
  tiers automatically once the catalog lists them, so **no new backfill code** — the
  next deploy's existing backfill pass grants already-earned tiers (FR-007).
- **Gallery counts a family once** (at highest tier) for the "N of M" header; the
  **"Most badges" board keeps counting records**, so tiers raise a member's board
  count (depth rewarded). This split is intentional and not user-confusing (the board
  is a relative ranking, the header a per-member tally).
- **Reuses** spec 035 (catalog, pure predicates/progress, recognition, celebration,
  BadgeView/BadgeChip) and spec 037 (gallery filter/sort, badge board).
- **Single-club**, per the constitution.

## Out of Scope

- Tiering the win-rate or streak badges (kept single-level v1).
- New badge families beyond the existing count-based ones.
- Prestige / infinite tiers beyond gold.
- New tier-up animations beyond the existing 🍻 celebration.
