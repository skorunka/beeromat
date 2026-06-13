# Feature Specification: Achievements / Badges

**Feature Branch**: `035-achievements-badges` (authored on `main`, trunk-based)

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Achievements / badges — persistent, unlockable, playful badges shown on player profiles. A direct extension of spec 034 (leaderboards-profiles): a persistent badge layer over the stats beeromat already computes. Members earn unlockable badges over time (Century club 💯, Hat-trick 🎩, Round king 🤝, …) shown on the /members/[memberId] profile; earning a new one fires the existing 🍻 celebration. Persisted (sticky, never revoked), earned at write-time, all badges live-derivable from existing stats. Mobile-first, club-scoped, playful, never mean."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a player's badges on their profile (Priority: P1)

A member opens any player's profile (their own from the account screen, or
anyone else's by tapping their name) and sees an **Achievements** section: a
grid of the badges that player has earned, each with its emoji, name, and a
short playful description, plus a count of how many they hold. Their own
profile is the obvious draw — "what have I unlocked?" — but every profile
shows the same section so the club can compare and rib each other.

Crucially, this works **the day the feature ships**: members who already
crossed a threshold long ago (e.g. logged their 100th beer months back) see
those badges as already-earned immediately, not only after their next action.

**Why this priority**: This is the whole visible payoff. Without the display
surface there is nothing to earn or show off. It is the MVP — a profile that
renders a member's earned badges, populated for the existing club history, is
already a shippable, valuable slice.

**Independent Test**: On a club with existing history, open several profiles
and confirm each shows exactly the badges that member's record qualifies for
(a 100+-beer member shows Century club; a 3-match newcomer does not show
Regular), with correct names/descriptions and an accurate earned count.

**Acceptance Scenarios**:

1. **Given** a member with 264 lifetime beers and 11 match wins, **When** I open their profile, **Then** I see the Century club and (if ≥25 wins) Winner badges, each with its emoji + name + description, and an "earned N" count.
2. **Given** a brand-new member with no beers and no matches, **When** I open their profile, **Then** the Achievements section shows zero earned badges (and an encouraging empty state), never a crash or a falsely-awarded badge.
3. **Given** the feature has just been deployed, **When** I open a long-standing member's profile, **Then** the badges they already qualified for appear immediately (backfilled), without requiring them to log or play first.
4. **Given** I open my own profile from the account screen, **When** the page loads, **Then** I see my own Achievements section identical in shape to anyone else's.

---

### User Story 2 - Earn a badge in the moment (Priority: P2)

When a member's action pushes them across a badge threshold — logging the beer
that makes 100, winning the match that makes their 25th win or extends a streak
to 5, pouring their 10th round for others — the app recognises the new badge at
that moment: it persists the unlock and celebrates it (the existing 🍻 beer
celebration plus a toast naming the badge, e.g. "Odznak odemčen: Century club 💯").
From then on the badge is permanently theirs and shows on the profile.

**Why this priority**: The "earned over time" moment is what makes the feature
feel alive and rewarding rather than a static list. It depends on US1's display
existing, so it is P2 — but it is the emotional core of the feature.

**Independent Test**: Drive a member from just-below to just-over a threshold
via the normal action (log a beer, record a match result), and confirm the
unlock is celebrated once, the badge appears on the profile afterwards, and
repeating the action does not re-celebrate or duplicate the badge.

**Acceptance Scenarios**:

1. **Given** a member with 99 lifetime beers, **When** they log one more beer, **Then** the unlock celebration fires naming Century club, and the badge is thereafter shown on their profile.
2. **Given** a member who just earned a badge, **When** they perform another qualifying-but-already-held action (log beer 101), **Then** no second celebration fires and no duplicate badge is recorded.
3. **Given** a member earns multiple badges from a single action (e.g. a match win that is simultaneously their 25th win and extends a 5-game streak), **When** the action completes, **Then** every newly-earned badge is recorded and surfaced (the celebration names them).
4. **Given** a member earns a badge, **When** a later event would reverse the underlying stat (a beer is voided dropping them back to 99, a match result is reversed), **Then** the badge is **not** revoked — it stays earned.
5. **Given** a member logs a round on behalf of teammates, **When** the round is recorded, **Then** badge recognition runs for the people whose totals changed and any newly-earned badges are recorded.

---

### User Story 3 - See what's still locked, as a goal to chase (Priority: P3)

Below their earned badges, a member sees the badges they **haven't** earned yet,
rendered in a muted/locked style with a short hint of what unlocks each one
("Win 25 matches", "Log 100 beers"). This turns the section into a checklist of
fun goals and invites the next beer or match.

**Why this priority**: Pure engagement upside; the feature is complete and
valuable without it (US1 + US2 already deliver the show-off + reward loop). It is
the cheapest possible add since the full badge catalog already lives in code, so
it ships in v1 if time allows, otherwise it cleanly defers to backlog.

**Independent Test**: Open a profile that has earned some but not all badges and
confirm the locked badges render distinctly (muted, not celebratory), each with a
truthful unlock hint, and that earned vs. locked are visually unambiguous.

**Acceptance Scenarios**:

1. **Given** a member who has earned 3 of the available badges, **When** I open their profile, **Then** I see those 3 highlighted and the remaining badges shown locked with their unlock hints.
2. **Given** a locked badge, **When** I read its hint, **Then** the hint accurately describes the condition (no misleading or impossible-sounding hints).

---

### Edge Cases

- **Threshold exactly met**: crossing to *exactly* the threshold (100th beer, 25th win, streak of exactly 3/5) earns the badge; one short does not.
- **Stat reversal after earning**: a voided beer, reversed match, or cancelled agreement that lowers the underlying stat never removes an already-earned badge (sticky), and never falsely awards one (recognition only ever inserts when the *current* stat qualifies).
- **Already-earned at ship time**: backfilled badges appear without a misleading "just unlocked" date or a fresh celebration — they read as long-held, not new.
- **Multiple badges from one action**: all are recorded; the celebration acknowledges each without spamming a separate full-screen animation per badge.
- **Member with no qualifying history**: empty, friendly Achievements state — never an error, never a falsely-awarded badge.
- **Same person viewed by self vs. others**: badges are public within the club; the section looks the same regardless of who is viewing.
- **Min-games-guarded badges** (e.g. a win-rate badge): a member below the minimum-matches guard cannot earn it even at a momentarily perfect ratio, mirroring the leaderboard guard from spec 034.
- **Distinct-beer-type badge**: counts distinct beer *types* logged, not total beers, and respects the same non-voided rule the rest of the stats use.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display an Achievements section on every player profile showing that member's earned badges (emoji, name, short description) and a count of how many they hold.
- **FR-002**: A member's own profile MUST be reachable from the account screen and MUST show the same Achievements section as any other profile.
- **FR-003**: The system MUST persist each earned badge per member so that an earned badge survives page reloads, sessions, and later changes to the underlying statistics.
- **FR-004**: Once earned, a badge MUST NOT be revoked — even if the underlying statistic later drops below the threshold (voided beer, reversed/cancelled match). Recognition is insert-only.
- **FR-005**: The system MUST recognise newly-earned badges at the time a member performs a qualifying action (logging a beer, logging a round, recording/affecting a match result), recording the unlock as part of that action — not as a side effect of merely viewing a page.
- **FR-006**: When a qualifying action earns one or more new badges for a member, the system MUST celebrate the unlock (the existing beer celebration) and name the earned badge(s) to that member.
- **FR-007**: Re-performing an action for a badge already held MUST NOT re-celebrate it or create a duplicate; each member holds at most one of each badge.
- **FR-008**: When a single action earns multiple new badges, the system MUST record all of them.
- **FR-009**: On first release, the system MUST backfill badges for all existing members so that members who already satisfy a badge's condition see it immediately, without first performing a new action.
- **FR-010**: Backfilled (pre-existing) badges MUST be presented as already-held rather than freshly-unlocked — no misleading "just now" timestamp and no unlock celebration for historical earns.
- **FR-011**: Every v1 badge's condition MUST be computable from a member's current aggregate statistics (the same data the profile already shows); the system MUST NOT require capturing point-in-time events for any v1 badge.
- **FR-012**: Each badge MUST have a stable identity and human-readable name + description available in both Czech and English, in the app's playful-but-kind tone (never mean-spirited).
- **FR-013**: The set of badges available in v1 MUST be fixed (no per-club configuration), defined centrally rather than created by users.
- **FR-014**: Badge recognition MUST be club-scoped — a member's badges reflect only their activity within their own club.
- **FR-015**: A guarded badge (one with a minimum-activity threshold, e.g. a win-rate badge) MUST NOT be awarded to a member below that minimum, consistent with the leaderboard guards.
- **FR-016**: Adding the feature MUST NOT change or gate any existing behaviour: logging beers, rounds, and recording match results continue to work exactly as before; badge recognition is purely additive and MUST NOT cause those actions to fail if recognition itself errors.
- **FR-017** *(US3, may defer)*: The profile MAY show not-yet-earned badges in a locked style with a truthful hint describing how to unlock each.

### Default v1 Badge Set

All conditions are evaluated against the member's current aggregate stats. Final
emoji and bilingual copy are settled during implementation; meanings are fixed here.

| Badge | Emoji | Earned when |
|-------|-------|-------------|
| Century club | 💯 | 100+ lifetime (non-voided) beers |
| Hat-trick | 🎩 | a win streak (current or best) of 3+ |
| On fire | 🔥 | a *current* win streak of 5+ |
| Round king | 🤝 | poured 10+ rounds / beers for others |
| Regular | 🎾 | played 25+ matches |
| Winner | 🏆 | won 25+ matches |
| Sharpshooter | 📈 | win rate ≥ 60% (only counted once past the minimum-matches guard, ≥10) |
| Connoisseur | 🍺 | logged 5+ distinct beer types |
| Night owl | 🦉 | attended 25+ distinct drink sessions |

(Tiered variants — 250/500 beers, etc. — and relative/point-in-time badges such
as "Giant-killer" or "was #1 on a board" are explicitly **out of scope v1**; see
Out of Scope.)

### Key Entities *(include if feature involves data)*

- **Earned badge**: a record that a specific member holds a specific badge, with the moment it was earned. Unique per (member, badge) — a member holds each badge at most once. Club-scoped. Never deleted under normal operation.
- **Badge (catalog)**: the definition of a badge — its stable key, emoji, bilingual name + description, unlock condition, and unlock hint. Defined centrally in the application, **not** stored as data rows; the catalog is the source of truth for what badges exist and what each means.
- **Member statistics** *(existing, from spec 034)*: the aggregate record/streak/beer/round/session figures a profile already computes; every badge condition is a predicate over these.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a club with substantial existing history (~50 members, ~2 years of data), every profile correctly shows exactly the badges that member's record qualifies for — zero falsely-awarded and zero missing badges across the club — immediately after release (backfill complete).
- **SC-002**: A member who crosses a threshold via a normal action sees the unlock celebrated within that same action's completion (no separate step, no page refresh required), 100% of the time.
- **SC-003**: After a stat-reversing event (void/reverse), a previously-earned badge remains shown — 0% revocation.
- **SC-004**: Repeating a qualifying action never produces a duplicate badge or a repeat celebration (each badge unlocked at most once per member).
- **SC-005**: Adding badge recognition introduces no perceptible slowdown to logging a beer or recording a match (the action completes within its existing time budget), and never causes the underlying action to fail.
- **SC-006**: A member can tell at a glance how many badges they hold and what each one is, on a phone screen, without horizontal scrolling.

## Assumptions

- **Persistence is required** (the user explicitly asked for "persistent, unlockable… earned over time… needs a small schema"). Pure live-compute is rejected because it cannot represent a meaningful "earned at" moment nor survive a stat reversal.
- **Badges are sticky / insert-only.** This is the deliberate resolution of void/reverse handling: a badge is a memorial of having once qualified, not a live status. Chosen because revocable badges would feel punishing and contradict the "nice/friendly/chill" credo.
- **Recognition happens at write-time, not on read.** Reading a profile must never perform a write; recognition is folded into the existing actions that change the relevant stats (logging a beer/round, recording/affecting a match result). Chosen to avoid writing during page render.
- **Backfill `earned_at` uses a single release-time stamp** for all pre-existing earns, and the UI suppresses the "freshly unlocked" treatment for them. Chosen as the simplest defensible way to avoid claiming everyone unlocked everything "today."
- **All v1 badge conditions are derivable from the existing per-member aggregate stats** (spec 034's `getPlayerStats` shape), adding at most one new simple aggregate (distinct beer-type count) if not already present. Anything needing point-in-time event capture is deferred.
- **Locked-badge preview (US3) is optional for v1.** It ships if cheap, otherwise defers cleanly to backlog; the badge catalog living in code makes either choice low-cost.
- **Badges are public within a club.** Any member can see any member's badges (same visibility model as the leaderboards/profiles in spec 034).
- **Reuses spec 034 throughout**: the profile page, the member-stats aggregates, the avatar component, and the existing beer-celebration mechanism.
- **Single-club only**, per the project constitution — no cross-club badges or comparisons.

## Out of Scope (v1)

- Tiered badges (bronze/silver/gold; 250/500-beer escalations).
- Point-in-time / relative badges that require capturing events as they happen ("was #1 on a board", "beat the reigning champion", "Giant-killer").
- Notifications / push for unlocks (beyond the in-app celebration at the moment of earning).
- A badge-based leaderboard or ranking by badge count.
- Any per-club or per-user configuration of which badges exist.
- Cross-club anything.
