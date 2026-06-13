# Feature Specification: Achievements / Badges

**Feature Branch**: `035-achievements-badges` (authored on `main`, trunk-based)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Achievements / badges — persistent, unlockable, playful badges shown on player profiles, a direct extension of spec 034. Persisted (sticky, never revoked), earned at write-time, all badges live-derivable from existing stats, with a 🍻 celebration on unlock. PLUS (follow-up direction): a full game-style badge gallery — show ALL badges so a member sees everything achievable and the exact condition for each, which ones they've already claimed and WHEN, with progress toward the locked ones. Get inspired by games (Steam/Xbox: full set shown, locked dimmed but condition visible, progress bars, earned dates, rarity, unlocked sorted to top). Mobile-first, club-scoped, playful, never mean."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The badge gallery: see everything achievable, what you've claimed, and how close you are (Priority: P1)

A member opens a player's profile (their own from the account screen, or anyone
else's by tapping their name) and sees an **Achievements** section that, game-style,
shows the **complete set of badges** — not just the ones earned. For each badge they
see its emoji, name, and the **exact condition to unlock it** ("Log 100 beers", "Win
25 matches"). Badges the player has **claimed** are shown vivid, with the **date they
were earned**; badges not yet earned are shown dimmed/locked but still legible, each
with a **progress indicator** toward its goal ("64 / 100"). Earned badges sort to the
top; a count ("5 of 9") sits at the section header. This is the inspiration the user
asked for — the Steam/Xbox achievements screen: the whole wall of goals, what you've
got, and what's next.

Crucially this works **the day the feature ships**: members who already crossed a
threshold long ago see those badges already-claimed (backfilled), so a 2-year veteran
opens to a wall of earned badges, not an empty one.

**Why this priority**: This is the headline the user emphasised — "we should have the
list of all badges so the user can see what he can achieve and by what condition, also
which they have already claimed and when." The gallery is the whole visible payoff and
the goal-chasing hook. It is the MVP: a profile that renders the full badge wall with
earned/locked state + conditions + progress + earned dates, populated for existing
history, is already shippable and valuable.

**Independent Test**: On a club with existing history, open several profiles and
confirm each shows ALL nine badges; earned ones are vivid with a date and sorted
first; locked ones are dimmed with their condition and a correct progress reading
(e.g. a 64-beer member shows Century Club locked at "64 / 100"); the header count
matches the earned tally.

**Acceptance Scenarios**:

1. **Given** a member with 264 beers and 30 wins, **When** I open their profile, **Then** the Achievements section lists every badge; Century Club 💯 and Winner 🏆 appear earned (vivid, with an earned date) and sorted ahead of the locked ones.
2. **Given** a member with 64 lifetime beers, **When** I view the (locked) Century Club badge, **Then** it shows its condition ("Log 100 beers") and a progress reading of "64 / 100" (≈64%), legible but visually distinct from earned badges.
3. **Given** a brand-new member, **When** I open their profile, **Then** the section still shows all nine badges — all locked, each with its condition and "0 / N" progress — never an empty void and never a crash.
4. **Given** the feature has just been deployed (backfill run), **When** I open a long-standing member's profile, **Then** the badges they already qualified for show as claimed immediately, with an earned date, without them having to do anything first.
5. **Given** I open my own profile from the account screen, **When** the page loads, **Then** I see the same full gallery for myself.

---

### User Story 2 - Earn a badge in the moment (Priority: P2)

When a member's action pushes them across a badge threshold — logging the beer that
makes 100, winning the match that makes their 25th win or extends a streak to 5,
pouring their 10th round — the app recognises the new badge at that moment: it
persists the unlock (stamping when it happened) and celebrates it (the existing 🍻
celebration + a toast naming the badge, "Odznak odemčen: Century Club 💯"). From then
on the badge is permanently theirs, shown claimed (with that date) in the gallery.

**Why this priority**: The "earned over time" moment is what makes the gallery feel
alive and rewarding rather than a static checklist, and it is what records the *when*
that US1 displays. It depends on the gallery existing, so P2 — but it is the emotional
core.

**Independent Test**: Drive a member from just-below to just-over a threshold via the
normal action and confirm the unlock is celebrated once, the badge then shows claimed
with today's date in the gallery, and repeating the action neither re-celebrates nor
duplicates.

**Acceptance Scenarios**:

1. **Given** a member with 99 beers, **When** they log one more, **Then** the unlock celebration fires naming Century Club, and the badge thereafter shows claimed with today's date.
2. **Given** a member who just earned a badge, **When** they do another qualifying-but-already-held action (log beer 101), **Then** no second celebration fires and no duplicate is recorded.
3. **Given** a member earns multiple badges from one action (25th win that is also a 5-streak), **When** the action completes, **Then** every newly-earned badge is recorded and named.
4. **Given** a member earns a badge, **When** a later event reverses the underlying stat (a beer voided to 99, a match reversed), **Then** the badge is **not** revoked — it stays claimed in the gallery.
5. **Given** a member logs a round for teammates, **When** the round records, **Then** badge recognition runs for everyone whose totals changed; their newly-earned badges are recorded (the actor's are also celebrated on-screen).

---

### User Story 3 - Rarity: how rare is each badge in the club (Priority: P3)

Each badge in the gallery shows how many club members hold it — a Steam-style rarity
cue ("Owned by 3 of 28 members" / "rare"). It turns the wall into a bragging surface:
a badge only two people have feels special.

**Why this priority**: Pure flavour on top of a complete gallery; the feature is fully
valuable without it (US1 + US2 deliver the wall + the reward loop). Cheap (one extra
aggregate), so it ships in v1 if time allows, otherwise defers cleanly to backlog.

**Independent Test**: On a seeded club, open a profile and confirm each badge shows a
truthful club-holder count/percentage that matches the underlying data, and that a
badge nobody has reads sensibly ("Be the first").

**Acceptance Scenarios**:

1. **Given** 3 of 28 members hold On Fire 🔥, **When** I view that badge, **Then** it shows a rarity cue reflecting 3/28.
2. **Given** no member holds a badge yet, **When** I view it, **Then** the rarity cue reads as "nobody yet / be the first", never "0%" in a confusing way.

---

### Edge Cases

- **Locked badge always legible**: locked badges are dimmed but never fully hidden or reduced to a mystery "???" — beeromat's whole point here is *showing* the condition to chase (unlike spoiler-hidden secret achievements in some games).
- **Progress cap**: progress never exceeds the target visually (an earned badge reads 100%/claimed, not "264/100").
- **Progress for non-count badges**: streak/win-rate badges still show a sensible progress ("best streak 2 / 3"; for win-rate, the guard is part of the goal — e.g. "needs 10+ matches at 60%").
- **Threshold exactly met** earns; one short does not.
- **Stat reversal after earning** never removes a claimed badge (sticky) and never falsely awards one (recognition only inserts when the current stat qualifies).
- **Backfilled badges** show as claimed without a misleading "just unlocked" pulse and without a fresh celebration; their earned date is the release stamp (presented plainly, e.g. "earned" without implying a precise historical day).
- **Member with no history**: full gallery, all locked, all "0 / N" — friendly, never an error.
- **Min-games-guarded badge** (win rate) cannot be earned below the guard even at a momentarily perfect ratio.
- **Distinct-beer-type / sessions** count distinct types / distinct sessions respectively, both honouring the non-voided rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Achievements section on a profile MUST display the **complete badge set** (every badge in the catalog), not only earned ones.
- **FR-002**: For **every** badge, the section MUST show its emoji, name, and the **human-readable unlock condition** (e.g. "Log 100 beers"), for earned and locked alike.
- **FR-003**: Earned (claimed) badges MUST be visually distinct from locked badges (vivid vs dimmed) and MUST show the **date the badge was earned**.
- **FR-004**: Locked badges MUST show a **progress indicator** toward their goal (current value vs target, e.g. "64 / 100"), derived from the member's current stats.
- **FR-005**: Earned badges MUST sort ahead of locked badges; the section header MUST show an **earned-of-total count** (e.g. "5 of 9").
- **FR-006**: A member's own profile MUST be reachable from the account screen and show the same full gallery as anyone else's.
- **FR-007**: The system MUST persist each earned badge per member, including the moment it was first earned, so it survives reloads, sessions, and later stat changes.
- **FR-008**: Once earned, a badge MUST NOT be revoked even if the underlying stat later drops below the threshold (sticky / insert-only).
- **FR-009**: The system MUST recognise newly-earned badges at the time a member performs a qualifying action (log beer / on-behalf / round, record match result), persisting the unlock as part of that action — never as a side effect of viewing a page.
- **FR-010**: When a qualifying action earns one or more new badges for the acting member, the system MUST celebrate the unlock (existing beer celebration) and name the earned badge(s).
- **FR-011**: Re-performing an action for an already-held badge MUST NOT re-celebrate or duplicate it; each member holds at most one of each badge.
- **FR-012**: When a single action earns multiple new badges, the system MUST record all of them.
- **FR-013**: On first release, the system MUST backfill badges for all existing members so historical qualifiers show as claimed immediately, stamped so they don't read as "just unlocked" (no fresh celebration, no misleading precise date).
- **FR-014**: Every v1 badge's condition AND progress MUST be computable from a member's current aggregate statistics; the system MUST NOT require point-in-time event capture for any v1 badge.
- **FR-015**: Each badge MUST have a stable identity and human-readable name, description, and condition/hint available in Czech and English, in the playful-but-kind tone (never mean).
- **FR-016**: The v1 badge set MUST be fixed and defined centrally (no per-club configuration, no user-created badges).
- **FR-017**: Badge recognition and display MUST be club-scoped — a member's badges and any rarity figure reflect only their own club.
- **FR-018**: A guarded badge (win-rate, with a minimum-matches threshold) MUST NOT be awarded below the guard, consistent with the leaderboard guards.
- **FR-019**: Adding the feature MUST NOT change or gate any existing behaviour; if badge recognition errors, the underlying log/match action MUST still succeed (recognition is a non-critical post-commit side effect).
- **FR-020** *(US3, may defer)*: Each badge MAY show a **club rarity** cue (how many / what share of club members hold it), with a sensible "nobody yet" state.

### Default v1 Badge Set

All conditions AND progress are evaluated against the member's current aggregate
stats. Emoji + final bilingual copy settled in implementation; meaning is fixed here.

| Badge | Emoji | Condition (shown to user) | Earned when | Progress shown (locked) |
|-------|-------|---------------------------|-------------|-------------------------|
| Century Club | 💯 | Log 100 beers | 100+ lifetime (non-voided) beers | totalBeers / 100 |
| Winner | 🏆 | Win 25 matches | won ≥ 25 | won / 25 |
| Sharpshooter | 📈 | Win 60% over 10+ matches | winRate ≥ 60% past the ≥10-match guard | matchesPlayed / 10 then ratio |
| On Fire | 🔥 | Win 5 in a row | current streak ≥ 5 | currentStreak / 5 |
| Hat-trick | 🎩 | Win 3 in a row | best streak ≥ 3 | bestStreak / 3 |
| Round King | 🤝 | Pour 10 rounds for others | roundsPoured ≥ 10 | roundsPoured / 10 |
| Regular | 🎾 | Play 25 matches | matchesPlayed ≥ 25 | matchesPlayed / 25 |
| Connoisseur | 🍺 | Try 5 different beers | distinctBeerTypes ≥ 5 | distinctBeerTypes / 5 |
| Night Owl | 🦉 | Attend 25 sessions | sessionsAttended ≥ 25 | sessionsAttended / 25 |

(Tiered escalations and relative/point-in-time badges remain **out of scope v1** — see
Out of Scope.)

### Key Entities *(include if feature involves data)*

- **Earned badge**: a record that a member holds a specific badge, with the moment first earned. Unique per (member, badge). Club-scoped. Never deleted under normal operation.
- **Badge (catalog)**: the definition of a badge — stable key, emoji, bilingual name + description + condition/hint, an earn predicate, and a progress function. Defined centrally in code, NOT stored as data rows.
- **Member statistics** *(existing, spec 034)*: the aggregate figures a profile already computes; every badge's earn AND progress is a function over these.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a club with substantial history (~50 members, ~2 years), every profile shows the full badge set with exactly the correct earned/locked split and correct progress readings — zero falsely-awarded, zero missing — immediately after release (backfill complete).
- **SC-002**: A member can, at a glance on a phone, see how many badges exist, which they hold (with dates), and how close they are to the rest — without horizontal scrolling.
- **SC-003**: A member who crosses a threshold via a normal action sees the unlock celebrated within that same action's completion (no refresh), 100% of the time, and the badge then reads claimed with that date.
- **SC-004**: After a stat-reversing event, a previously-earned badge remains claimed — 0% revocation.
- **SC-005**: Repeating a qualifying action never produces a duplicate badge or a repeat celebration.
- **SC-006**: Adding badge recognition introduces no perceptible slowdown to logging a beer or recording a match, and never causes the underlying action to fail.

## Assumptions

- **Persistence is required** (explicit user ask). Pure live-compute is rejected: no meaningful earned-at date (which US1 now displays) and no survival across stat reversal.
- **Badges are sticky / insert-only.** Deliberate resolution of void/reverse handling; a badge is a memorial, not a live status.
- **Recognition happens at write-time, not on read.** Reading a profile never writes; recognition folds into the existing mutating actions.
- **The full gallery is computed from data the profile already loads.** The profile already fetches the member's aggregate stats (spec 034); the gallery derives every badge's earned/locked + progress from that plus the persisted earned set — no write on read, and no heavy new per-badge query for progress.
- **Backfill `earned_at` uses a single release-time stamp**, presented plainly (no precise-historical-day claim, no fresh-unlock pulse).
- **All v1 badge earn + progress are derivable from the existing aggregate stats**, adding at most one new simple aggregate (distinct beer-type count) and exposing one already-computed one (sessions attended).
- **Rarity (US3) is optional for v1** — one extra club-wide count; ships if cheap, else backlog.
- **Badges + rarity are public within a club** (same visibility as spec 034 stats).
- **Reuses spec 034**: the profile page + its already-loaded member stats, the avatar component, and the existing beer-celebration mechanism.
- **Single-club only**, per constitution.

## Out of Scope (v1)

- Tiered badges (bronze/silver/gold; 250/500-beer escalations).
- Point-in-time / relative badges needing event capture ("was #1 on a board", "beat the reigning champion", "Giant-killer").
- Secret/spoiler-hidden achievements (beeromat intentionally shows all conditions).
- Notifications / push for unlocks beyond the in-app celebration.
- A badge-count leaderboard, sorting/filtering controls on the gallery, badge config UI.
- Cross-club anything.
