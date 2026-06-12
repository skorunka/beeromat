# Feature Specification: Leaderboards + player profiles

**Feature Branch**: `main` (trunk-based — no feature branch)

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Leaderboards + player profiles — make the club competitive and fun. A joyful, mobile-first stats layer over the data beeromat already has: club leaderboards, per-player profile/stats, and a playful data-driven fun-line engine."

## Personas

- **Franta (the regular, 35, phone)** — plays + drinks most weeks; wants to know if he's top of the beers board and how he stacks up against his usual opponents. Checks his own profile after a match.
- **Pavel (the competitor, 42, phone)** — cares about win rate + streaks; chases the 🏆 board and wants to see his nemesis and favourite victim.
- **Hana (the occasional, 29, phone)** — comes a few times a month; wants to find *herself* on a board quickly without scrolling 50 rows, and enjoys the playful one-liners.
- **Karel (club_admin / treasurer, 50, desktop + phone)** — no special powers here; sees the same boards as everyone. Stats are club-internal and visible to all members.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Club leaderboards (Priority: P1)

A member opens "Žebříčky" (Leaderboards) and sees ranked boards of the club: most beers drunk, biggest tab, most matches won, most matches played, best win rate, longest current win streak, most beers bought for others. Each board shows avatar + name + the value, with a podium feel for the top 3 and **the viewer's own row highlighted** so they can find themselves at a glance. They can toggle the scope between **all-time** and **this season**.

**Why this priority**: The leaderboards are the heart of the "make it competitive + fun" ask — the single highest-value, most-shared surface. It stands alone as an MVP.

**Independent Test**: Open the leaderboards on a club with history; verify each board ranks the right members by the right metric (e.g. the member with the most non-voided beers tops the beers board), the top 3 read as a podium, the viewer's own row is marked, and toggling all-time ↔ season changes the numbers.

**Acceptance Scenarios**:

1. **Given** a club with consumption + match history, **When** the member opens the leaderboards, **Then** each default board lists members ranked by its metric, highest first, showing avatar + name + value.
2. **Given** the member is somewhere down a board, **When** the board renders, **Then** their own row is visually highlighted (and reachable without hunting — e.g. pinned/scrolled-to) so they can see their standing.
3. **Given** the win-rate board, **When** it renders, **Then** members below the minimum-matches threshold are excluded (so a 1–0 player can't top it), and the threshold is shown/explained.
4. **Given** the scope toggle, **When** the member switches all-time → this season, **Then** every board recomputes to the season window and the active scope is clearly indicated.
5. **Given** a brand-new club with no history, **When** the boards render, **Then** each shows a friendly empty/low-data state rather than an error or a blank.

---

### User Story 2 - Player profile / stats (Priority: P2)

Tapping a member anywhere (a leaderboard row, a match lineup, an attribution) opens that member's **profile**: matches played / won / lost, win-loss ratio, current + best win streak; **nemesis** (most-lost-to opponent) and **favourite victim** (most-beaten); **best partner** and **jinx partner** (doubles partners by win rate, with a minimum-games guard); beers/night average, favourite beer, total beers, rounds poured, and current tab. A member reaches their own profile from their account.

**Why this priority**: The profile is the personal counterpart to the public boards — the "how am *I* doing / who's my rival" view. Valuable, but the boards deliver the headline value first.

**Independent Test**: Open a member's profile on a club with singles + doubles history; verify each stat matches a hand-computed expectation (e.g. nemesis = the opponent who beat them the most), and that thresholds hide noisy partner/opponent stats when there aren't enough games.

**Acceptance Scenarios**:

1. **Given** a member with match history, **When** their profile opens, **Then** played/won/lost, ratio, and current + best streak are correct.
2. **Given** a member with a clear most-lost-to opponent, **When** the profile renders, **Then** that opponent is shown as the nemesis (and the most-beaten as favourite victim), each with the head-to-head record.
3. **Given** a member with doubles history, **When** the profile renders, **Then** best/worst partner reflect win rate *together* and only appear once they meet the minimum-games guard.
4. **Given** a member with consumption history, **When** the profile renders, **Then** beers/night, favourite beer, total beers, rounds poured, and current tab are correct.
5. **Given** a member with little/no history, **When** the profile renders, **Then** stats that can't be computed (no nemesis yet, no partner yet) degrade gracefully to a friendly placeholder, not an error.

---

### User Story 3 - Playful fun-line engine (Priority: P3)

Profiles (and optionally a leaderboard header) surface a few **data-driven one-liners** in the club's chill, friendly tone — e.g. "Undefeated in 6 — someone stop them. 🔥", "0–7 vs Honza. It's not a rivalry, it's a subscription.", "Averages 4.2 beers a night — a true professional. 🍺", "Owes Pepa 3 beers — pay up. 🍺". Lines are chosen from the member's real stats, never mean-spirited.

**Why this priority**: This is the "joy" layer — it makes the stats delightful rather than dry. It's pure polish on top of US1/US2 data and ships last.

**Independent Test**: For a member with known stats, verify the engine selects the applicable lines and fills them correctly (the right numbers/names), and that members with no qualifying stats get no line (or a gentle default) rather than a broken template.

**Acceptance Scenarios**:

1. **Given** a member on a win streak ≥ a threshold, **When** their profile renders, **Then** the "undefeated in {n}" line appears with the correct {n}.
2. **Given** a lopsided head-to-head, **When** the profile renders, **Then** the "rivalry/subscription" line appears with the correct record + opponent name.
3. **Given** a member with no qualifying fun facts, **When** the profile renders, **Then** no broken/empty template is shown (a gentle fallback or nothing).
4. **Given** both Czech and English, **When** a line renders, **Then** it reads naturally in that language (number/name placeholders filled, correct plural forms).

---

### Edge Cases

- **Ties** on a board (equal value): a stable, defined tie-break (e.g. by name) so order is deterministic; tied members may share a rank visually.
- **Inactive / departed members**: surfaced where they still hold a record? Default — include only currently active members in the boards (their history still counts toward opponents/partners on others' profiles).
- **Voided data**: voided consumptions and reversed/voided matches MUST NOT count toward any stat.
- **Minimum thresholds**: win-rate board and best/worst partner/opponent need a minimum-games guard so tiny samples don't dominate; below threshold → excluded from that specific stat, not from the member's existence.
- **Season with no activity**: a board scoped to "this season" on a quiet club shows the empty/low-data state.
- **Self on a board**: always findable (highlight + ensure the viewer's row is reachable even if ranked low).
- **Privacy**: all stats are club-internal and visible to every member; nothing is exposed outside the club.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a leaderboards surface listing, per board, the club's **active** members ranked by the board's metric, highest-first, each row showing the member's avatar, name, and value.
- **FR-002**: The default boards MUST be: most beers drunk, biggest current tab, most matches won, most matches played, best win rate (subject to a minimum-matches guard), longest current win streak, and most beers bought for others (on-behalf + rounds poured).
- **FR-003**: Each board MUST give the top 3 a podium treatment and MUST highlight (and make reachable) the **viewing member's own row**.
- **FR-004**: The leaderboards MUST offer a scope toggle between **all-time** and **this season**, recomputing every board for the chosen window and clearly indicating which is active.
- **FR-005**: The system MUST provide a per-member **profile** showing: matches played / won / lost, win-loss ratio, current + best win streak; nemesis + favourite victim (with head-to-head records); best + jinx partner (with a minimum-games guard); beers/night average, favourite beer, total beers, rounds poured, and current tab.
- **FR-006**: A member's profile MUST be reachable by tapping that member where they appear (leaderboard rows, match lineups, attributions) and the member's **own** profile MUST be reachable from their account.
- **FR-007**: Every stat MUST exclude voided/reversed data (voided consumptions, reversed/voided matches) so figures match the club's real, current records.
- **FR-008**: Stats requiring a meaningful sample (win rate on a board; best/worst partner + nemesis/victim on a profile) MUST apply a minimum-games guard and degrade gracefully (exclude that stat / show a friendly placeholder) rather than surface noisy or broken values.
- **FR-009**: The system MUST surface a small set of **data-driven playful lines** on profiles (and optionally a leaderboard header), selected + filled from the member's real stats, in the club's friendly tone, in both Czech and English, never mean-spirited, with a graceful fallback when no line qualifies.
- **FR-010**: All boards + profile stats MUST be **live-computed** from existing records (no new persisted achievements/season archives) and remain correct as data changes.
- **FR-011**: The leaderboards MUST render quickly and remain usable on a club with substantial history (tens of members, thousands of consumptions, hundreds of matches over years) — i.e. aggregate, don't iterate per member.
- **FR-012**: All stats MUST be **club-scoped** and visible to every member of that club; no cross-club data and nothing exposed outside the club.

### Key Entities *(include if feature involves data)*

- **Leaderboard (computed)**: a named board (metric + scope) → an ordered list of `{ member, value, rank }`, plus the viewer's own entry. Not persisted; derived on read.
- **Player stats (computed)**: a member's aggregated figures (match record, streaks, head-to-head map, partner map, beer aggregates, tab). Derived on read.
- **Fun line (computed)**: a selected, filled template string for a member, chosen from their stats. Not persisted.
- Reuses existing: members, consumptions (+ `round_id`), matches, match_agreement_sides, match_bet_debts, payments/balance, drink_sessions, beer_types.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can find **where they rank** on any default board in a single tap from the match hub / nav, with their own row visibly marked.
- **SC-002**: Every board ranks members correctly by its metric (verifiable against hand-computed expectations on a seeded club), with voided data excluded and ties broken deterministically.
- **SC-003**: A member's profile shows a correct match record + win streak + nemesis/victim + best/jinx partner (verifiable against a seeded singles **and** doubles history), with thresholds hiding small-sample noise.
- **SC-004**: The leaderboards page loads in **under ~1.5s** on the heavy dataset (~50 members, ~13k consumptions, ~270+ matches, ~2 years) — boards are SQL-aggregated, not per-member loops.
- **SC-005**: At least 6 distinct playful lines exist; for a member with known stats the engine fills them with the correct numbers/names in both cs + en, and a member with no qualifying stats sees no broken template.
- **SC-006**: 100% of stats are club-internal — no member can see another club's data and nothing leaks outside the club.

## Assumptions

- **"Season" = rolling last 90 days** (the simplest defensible default the brief asked for): a board's "this season" scope counts only records whose date falls in the last 90 days. All-time is the unfiltered default.
- **Win-rate board minimum = 10 matches**; **best/worst partner + nemesis/victim minimum = 3 games together / against**. These guards keep tiny samples out; exact numbers are tunable constants.
- **Boards include only currently active members**; departed members' history still counts toward others' head-to-head/partner stats.
- **Profiles are public within the club** — every member sees every member's stats; no privacy toggle in v1.
- **No schema change** — all stats derive from existing tables; if a leaderboard query needs an index it's an additive, behaviour-neutral migration (preferred: none).
- **Doubles data for partner stats** — the heavy dev seed is currently singles-only, so this feature's implementation MUST extend the seed to generate valid doubles matches so best/worst-partner stats are populated + testable.
- **Tone** — playful, warm, club-insider; lines are teasing-but-kind, never humiliating.
- **Mobile-first, club-scoped**, consistent with the rest of the app; bottom-nav / match-hub entry point.
