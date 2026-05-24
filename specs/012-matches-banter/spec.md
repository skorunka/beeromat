# Feature Specification: Matches + Loser-Pays-Beer Banter (v1.12)

**Feature Branch**: `012-matches-banter`

**Created**: 2026-05-24

**Status**: Draft — autonomous-mode skeleton; pending user refinement before /speckit-plan

**Input**: User description (2026-05-24): "+ new feature, organise matches and beer banter, then settle after match who won gets beers from losers, need to refine this feature later" and "for the easy user flow — we sit and I bring beers then everyone opens app and log the beer, also losers should log in beer as part of the lost match, figure out the WLO [win-loss-other], texting, icons, it must be funny but still mobile friendly and easy to use."

The club's actual on-court mechanic: members play tennis matches,
the loser owes the winner one or more beers. Today this lives in
human memory + the existing `/bet` flow (manual beer transfers
between members). v1.12 makes it a first-class flow: log a match,
record who won/lost, the loser pays N beers automatically through
the existing bet-transfer pipeline — with a tonal layer that's
funny and one-thumb friendly per the user's "easy + funny" brief.

## Personas

- **P1 — Standa, 67 · Czech only**: lost a match, opens the app
  immediately back at the bar. He wants ONE tap that says "yes I
  lost, here's my beer". Standa is the spec's mobile-friendliness
  canary.
- **P3 — Tereza, 34 · Bilingual on iPhone**: wins more often than
  she loses. She wants to log the match WHILE Pavel is still
  catching his breath, with playful copy that doesn't rub it in
  too hard.
- **P5 — Pavel, 45 · Club admin**: reconciles disputed match
  outcomes ("but I won the third set!") via the existing
  payments-dispute mechanism. Out of v1.12 scope to make matches
  themselves disputable; future spec.

## Open Questions (user to clarify before /speckit-plan)

These are NOT [NEEDS CLARIFICATION] markers blocking the spec —
they're product-shape decisions only the user can make. Each option
has an obvious default the spec falls back to absent input.

**Q1 — Singles only, or include doubles?**
- (Recommended default) Singles only for v1.12. Two member ids,
  winner + loser, one row. Doubles is a future spec (needs team
  modelling).
- Alternative: model teams from day one. Adds 2-4× complexity for
  uncertain value at small-club scale.

**Q2 — How many beers does the loser owe?**
- (Recommended default) Fixed, configurable at the club level. New
  column on `clubs`: `match_loser_beer_count` (default: 1). The
  loser owes N of whatever the winner ordered that round, or
  picks from the beer menu.
- Alternative A: Per-match, the winner chooses N at match-log time.
  More flexible, more taps.
- Alternative B: Per-set / per-game scaling formula. Way too clever.

**Q3 — When does the bet-transfer fire?**
- (Recommended default) Immediately on match log, with a 5-minute
  undo window (matches the spec 001 consumption-undo convention).
  The loser sees a toast "🍻 -1 beer to Tereza" and can tap "Undo"
  to reverse if it was misrecorded.
- Alternative: Two-step (log match → loser confirms → transfer
  fires). More friction; not in the user's "easy" brief.

**Q4 — Which screen owns the "log a match" affordance?**
- (Recommended default) New top-level route /match (with the bottom
  nav growing a "match" tab next to /log and /bet). Fits the
  "everyone opens the app" tonight-flow.
- Alternative: Live as a button on /bet's existing screen. Less
  navigation discovery; mixes two related-but-distinct concerns.

## User Scenarios & Testing (mandatory)

### US1 — Loser logs the match (Priority: P1)

**Why this priority**: this IS the feature. Standa-after-losing is
the spec's blocker.

**Independent Test**: Two members exist in the club; member A
logs a match where A=loser, B=winner. Assert: a `matches` row
exists with the correct winner/loser ids; N (configurable, default
1) bet_transfer rows exist from A → B for the most recent
non-archived beer type; toast indicates the transfer; an "undo"
control is visible for 5 minutes per spec 001 convention.

**Acceptance Scenarios**:
1. **P1 (Standa lost)** — Given Standa and Pavel both members,
   When Standa taps "I lost to Pavel" on /match and confirms,
   Then a matches row records (loser=Standa, winner=Pavel,
   played_at=now) AND one bet_transfer row is created from Standa
   to Pavel for the most-recent beer they shared this session
   (falling back to the cheapest non-archived beer if no
   session-current shared beer exists).
2. **P3 (Tereza won)** — Given Tereza and Standa both members, When
   Tereza taps "I won against Standa" on /match and confirms, Then
   the same row + transfer materialises (winner=Tereza, loser=Standa).
3. **Misclick undo** — Given a just-logged match within the 5-minute
   undo window, When the logger taps "undo", Then the matches row is
   soft-deleted (compensating row pattern per constitution V) AND
   the bet_transfer row is voided.

### US2 — Funny copy + icons (Priority: P2)

Toasts, button labels, and confirmation dialogs use playful Czech +
English copy. Icons (lucide-react: Trophy, Frown, Beer) reinforce
the win/lose narrative without taking up screen.

**Examples (catalog copy, not final):**
- Win confirm: "🏆 Tvoje pivo, Pavel platí." / "🏆 Your beer,
  Pavel's buying."
- Loss confirm: "🍺 Tvoje pivo Pavlovi. Příště, kámo." / "🍺 Beer
  to Pavel. Get 'em next time."
- Match logged toast: "Zapsáno. Vyrovnáno." / "Logged. Settled."

Note: copy refinement is INSIDE this spec's scope (matches the
user's brief "funny but mobile friendly"); not deferred to a
separate spec.

### US3 — Match history visible (Priority: P2)

The existing /history screen grows a match section showing the
last N matches with their W/L outcome for the current member.
Read-only; no edit affordance.

## Functional Requirements (sketch)

- **FR-001**: New entity `matches` with at minimum:
  `(id, club_id, winner_member_id, loser_member_id, played_at,
  created_by_user_id, voided_at, voided_by_user_id, void_reason)`.
  Soft-delete pattern per constitution V.
- **FR-002**: New optional column `clubs.match_loser_beer_count`
  (default 1) — configurable via /admin/config (extends spec 008's
  ClubConfigForm).
- **FR-003**: New action `logMatchAction({ opponentMemberId, role:
  'winner' | 'loser' })` — creates the matches row AND the N
  bet_transfer rows in one transaction.
- **FR-004**: Compensating action `voidMatchAction(matchId)` — soft-
  deletes the matches row AND voids the associated bet_transfer
  rows. Window-gated (5 minutes) per spec 001 convention; admin
  can override.
- **FR-005**: New route `/match` with a single-screen
  opponent-picker + "I won" / "I lost" buttons.
- **FR-006**: Bottom nav grows a "Zápas" / "Match" tab between /log
  and /bet (constitution Principle I — one-thumb reach).
- **FR-007**: Full i18n parity (cs + en) under new `match.*`
  namespace.
- **FR-008**: Match history on /history filters to the current
  member's matches; treasurer/admin sees all on a separate admin
  screen (deferred to future spec).

## Out of Scope (explicitly)

- Doubles / team matches.
- Per-set / per-game tracking.
- Match scheduling / calendar integration.
- Disputed-match resolution (treasurer arbitration).
- Tournament brackets.
- Per-sport modelling (tennis-only; assume the club only plays one
  sport).
- Player rankings / ELO.

## Success Criteria

- **SC-001**: Standa logs a loss in under 15 seconds end-to-end
  on a mid-range phone (open /match → pick opponent → tap "I lost"
  → confirm → see toast).
- **SC-002**: 100% of logMatchAction calls that return ok=true
  result in matches=1 AND bet_transfers=N rows in the DB; no
  partial state on commit.
- **SC-003**: i18n parity for `match.*`; pnpm i18n:check passes.
- **SC-004**: Undo within 5 minutes voids both the matches row AND
  the bet_transfers atomically; 100% of undo invocations leave a
  consistent state.

## Assumptions / Defaults to bake in absent user clarification

- v1.12 ships singles only (Q1 default).
- 1 beer per match loss, configurable via /admin/config (Q2 default).
- Transfer fires immediately with 5-min undo (Q3 default).
- New /match route + bottom-nav tab (Q4 default).
- Bet transfer picks the loser's most-recent beer of the session,
  falling back to the cheapest active beer.

## Implementation Notes (for /speckit-plan)

- Schema: new `matches` table + new `clubs.match_loser_beer_count`
  column. ONE migration.
- Reuses existing `bet_transfers` schema entirely (no changes).
- Validation: `lib/validation/match.ts` — opponent picker + outcome.
- Action: `app/[locale]/(app)/match/actions.ts`.
- Page: `app/[locale]/(app)/match/page.tsx`.
- Nav: extend bottom-nav component with the Match tab.
- Catalogs: ~15 new keys under `match.*`.
- Tests: unit (schema, action transaction with seeded session +
  beers); E2E (US1 happy path, US2 copy assertion, undo).
- Estimated effort once refined + planned: ~1.5h of execution.

---

**Next steps for the user (when reading this back):**
1. Answer Q1-Q4 above (or accept defaults).
2. Reply "go" to invoke /speckit-plan against this spec.
3. After plan + tasks + implement → merge to main (Vercel
   auto-deploy) — usable for the NEXT match night.
