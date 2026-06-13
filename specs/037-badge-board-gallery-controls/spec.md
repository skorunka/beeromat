# Feature Specification: Badge leaderboard + gallery sort/filter

**Feature Branch**: `037-badge-board-gallery-controls` (authored on `main`, trunk-based)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Two achievements enhancements: (1) a 'Most badges' leaderboard board ranking members by how many badges they hold; (2) sort/filter controls on the profile achievements gallery (All/Earned/Locked filter + Default/Rarest/Closest-to-unlock sort). Follow-up to spec 035 (achievements) + 034 (leaderboards). No schema change; gallery controls are client-only over already-loaded data."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - "Most badges" leaderboard board (Priority: P1)

A member opens /leaderboards and finds, alongside the existing boards, a **Most
badges 🏅** board ranking everyone by how many achievements they hold — so the
badge-collecting that spec 035 introduced becomes a club competition. Picking it
from the board switcher shows the ranked list (podium medals for the top 3, the
viewer's own row highlighted), exactly like every other board.

**Why this priority**: This is the competitive payoff that makes badges matter
club-wide — the headline of this feature, and it reuses all the existing board
machinery so it's high-value/low-cost.

**Independent Test**: On a club where members hold differing numbers of badges,
select the Most-badges board and confirm members are ranked by badge count
(most first), the viewer's row is highlighted, and it's club-scoped.

**Acceptance Scenarios**:

1. **Given** members hold 5, 3, and 0 badges, **When** I open the Most-badges board, **Then** they rank in that order with dense ranking + podium medals; the 0-badge member follows the existing board's last-place/empty behaviour.
2. **Given** I'm viewing the board, **When** my own row is outside the visible top-N, **Then** my row is still surfaced/highlighted (same viewer-row behaviour as other boards).
3. **Given** another club's members also hold badges, **When** I view my club's board, **Then** only my club's members appear.
4. **Given** the all-time/season scope toggle, **When** I switch scope on the Most-badges board, **Then** the board behaves per the defined scope rule (badges are all-time; see Assumptions) without showing misleading numbers.

---

### User Story 2 - Browse the badge wall: filter + sort (Priority: P2)

A member on a player's profile wants to focus their badge gallery: show only
**Earned** (to admire) or only **Locked** (to see what's left), and reorder by
**Rarest first** (bragging rights) or **Closest to unlock** (what to chase next).
A small control row above the grid drives this; the default view is unchanged.

**Why this priority**: Quality-of-life browsing on top of the existing gallery;
valuable but secondary to the competitive board. Pure client-side over data the
profile already loads.

**Independent Test**: On a profile, switch the filter to Earned (only earned
badges show), to Locked (only locked show); switch sort to Closest-to-unlock and
confirm locked badges order by progress; Default restores the original order.

**Acceptance Scenarios**:

1. **Given** the gallery shows all badges, **When** I choose the "Earned" filter, **Then** only earned badges remain; "Locked" shows only locked; "All" restores everything.
2. **Given** the "Closest to unlock" sort, **When** applied, **Then** locked badges are ordered by how close they are to their goal (nearest first).
3. **Given** the "Rarest first" sort with rarity available, **When** applied, **Then** badges order by fewest club holders first.
4. **Given** I haven't touched the controls, **When** the gallery first renders, **Then** it shows the existing default order (earned-first, then catalog order) — nothing about the default view changes.
5. **Given** a filter that yields no badges (e.g. "Earned" for a member with none), **When** applied, **Then** a friendly empty note shows rather than a blank area.

---

### Edge Cases

- **Badge-count scope**: switching to "season" must not show a misleading rolling-window badge count (badges are sticky + backfill-stamped). The board is all-time regardless of scope (see Assumptions).
- **Zero badges**: a member with no badges sorts last / is handled by the existing board empty-row behaviour; not a crash.
- **Ties in badge count**: members with equal counts share a rank (dense ranking, tie-broken by name) like other boards.
- **Rarity unavailable**: if the holder-count data isn't present, the "Rarest first" sort option is hidden or no-ops (never an error).
- **Filter + sort combined**: filtering to Locked then sorting Closest-to-unlock works together; filtering to Earned then "Closest to unlock" is sensible (earned read as complete).
- **Controls don't shift the default**: a member who never touches the controls sees exactly today's gallery.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The leaderboards surface MUST include a "Most badges" board ranking club members by the number of badges they currently hold, selectable from the same board switcher as the other boards.
- **FR-002**: The Most-badges board MUST use the same presentation as other boards: dense ranking, podium medals for the top 3, and the viewer's own row highlighted/surfaced.
- **FR-003**: The Most-badges board MUST be club-scoped (only the viewer's club's members).
- **FR-004**: The Most-badges board MUST present an all-time count regardless of the all-time/season scope toggle (badge holdings are sticky and not meaningfully season-windowed); it MUST NOT show a misleading season-filtered number.
- **FR-005**: The profile achievements gallery MUST offer a filter with at least All / Earned / Locked, changing which badges are shown without reloading the page.
- **FR-006**: The gallery MUST offer a sort with at least Default (current earned-first, then catalog order), Closest-to-unlock (locked badges by progress toward goal, nearest first), and — when club rarity is available — Rarest first (fewest holders first).
- **FR-007**: With no control interaction, the gallery MUST render exactly the current default order and full set (no behaviour change to the default view).
- **FR-008**: A filter/sort combination that yields no badges MUST show a friendly empty state, not a blank region.
- **FR-009**: The controls MUST be mobile-first and visually consistent with the existing chip/segmented controls (board chips / scope toggle).
- **FR-010**: This feature MUST NOT change the database schema. The badge-count board is an aggregate over existing badge records; the gallery controls operate purely on data the profile already provides.
- **FR-011**: All new user-facing copy (board label, filter/sort option labels, empty states) MUST be available in Czech and English.
- **FR-012**: The member's chosen filter/sort is per-visit only — it need not persist across navigations (persistence is out of scope).

### Key Entities *(include if feature involves data)*

- **Badge-count board row**: a member + their held-badge count, ranked. Derived by counting that member's earned-badge records (spec 035), club-scoped. No new stored entity.
- **Gallery view state**: the in-memory filter + sort selection applied to the already-computed badge list on a profile. Not persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a seeded club, the Most-badges board ranks every member by their exact held-badge count (verified against the data), club-scoped, with the viewer row surfaced — zero miscounts.
- **SC-002**: Switching the gallery filter/sort re-renders the shown badges instantly (no page reload, no new data fetch).
- **SC-003**: With no control interaction, the gallery is pixel-for-pixel the current default view (no regression).
- **SC-004**: No database migration is introduced.
- **SC-005**: All new copy renders correctly in both cs and en.

## Assumptions

- **Badge board is all-time only.** Because badges are sticky and most were
  backfilled with a single release stamp, a rolling-90-day "season" badge count is
  misleading. The board shows the all-time count under either scope (it ignores
  `season`). Chosen over hiding it on season (keeps the board always reachable).
- **Reuses the existing board machinery** (spec 034): the ranking, podium, viewer
  row, board switcher chip, and empty-row behaviour are all shared — the new board
  is one more aggregate + one more switcher entry + label/emoji (🏅).
- **Gallery controls are client-only** over the `BadgeView[]` the profile already
  builds server-side (spec 035) — no new query, no new data; the server still
  assembles the data and a small client child applies the filter/sort.
- **"Rarest first" reuses the rarity holder-count** the profile already loads
  (spec 035 US3). If absent, the option is hidden/no-op.
- **Sort/filter is per-visit**, not persisted (no URL/localStorage) — deferred.
- **Single-club**, per the constitution.

## Out of Scope

- Per-stat configuration / custom boards (separate backlog item).
- New badge types or threshold changes (separate items).
- Persisting the chosen sort/filter across visits (URL/localStorage) — deferred.
- Season-archived badge counts.
