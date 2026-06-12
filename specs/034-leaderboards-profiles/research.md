# Phase 0 Research: Leaderboards + player profiles

Decisions resolving the spec's deliberately-deferred knobs and the computation
strategy. Every "unknown" was a design choice — the data already exists.

## D1 — Aggregate in SQL, one query per board, in parallel

**Decision**: Each board is **one `GROUP BY` query** returning `{ memberId,
value }` ordered desc, joined to `members` for avatar/name, capped to a top-N
(e.g. 20) — run concurrently with `Promise.all`. The viewer's own entry is
resolved separately (its rank) and appended if outside the top-N.

**Rationale**: FR-011 + SC-004 (sub-1.5s on ~13k consumptions / ~270 matches).
A per-member loop (50× balance/streak) is the trap; SQL aggregation over the
existing indexes (`idx_consumptions_member_created`, `idx_matches_winner/loser`)
is one round-trip per board, all in flight at once.

**Alternatives**: per-member compute in JS (rejected — N+1, slow, unbounded);
a materialised stats table (rejected — FR-010 wants live, no new persistence).

## D2 — "This season" = rolling last 90 days (time-windowed boards only)

**Decision**: Season scope filters time-stamped facts to the last 90 days
(`consumptions.created_at`, `matches.played_at`). The **biggest-tab** board is a
**current-state** metric (outstanding balance) — it is **not** time-windowed;
under the season toggle it still shows the current tab (documented in its
caption). All-time is the unfiltered default.

**Rationale**: The brief said "pick the simplest defensible default." A rolling
90-day window needs no season table, no calendar-boundary logic, and "what's
hot lately" is the natural competitive read. Tab is a balance, not an event
stream, so windowing it would require reconstructing historical balances —
out of proportion; current tab is the meaningful number.

**Alternatives**: calendar year (rejected — Jan resets feel arbitrary mid-year);
persisted seasons (rejected — out of scope, FR-010).

## D3 — Win streak: fetch ordered match results, fold in JS (pure fn)

**Decision**: For the **streak board**, one query returns every non-voided
match `{ winnerMemberId, loserMemberId, playedAt }` (≈ hundreds — tiny);
in JS, build each member's chronological W/L sequence and fold to a **current**
streak (consecutive wins ending at their latest match) via a pure
`currentWinStreak(results)` fn. For a **profile**, the same fn runs on that
member's results for current + best streak.

**Rationale**: Streaks are sequential, awkward in portable SQL; the match volume
is small enough that one bounded fetch + an O(n) fold is simpler and fully
unit-testable. Keeps the gnarly logic out of SQL and in a tested pure function.

**Alternatives**: SQL window functions / gaps-and-islands (rejected — harder to
read/test for marginal gain at this scale).

## D4 — Head-to-head (nemesis / favourite victim): GROUP BY opponent

**Decision**: From `matches` where the member is winner or loser, aggregate per
opponent into `{ opponentId, wins, losses }`. **Nemesis** = opponent with the
most losses-to (then most games, then name); **favourite victim** = most
wins-against. A **min-games guard (≥3 vs that opponent)** filters noise. Pure
`pickNemesis(map)` / `pickFavouriteVictim(map)`.

**Rationale**: Deterministic, testable selection with explicit tie-breaks; the
guard satisfies FR-008.

## D5 — Partners (best / jinx): from doubles agreement sides

**Decision**: A **partner** = the other member on the **same side** of a
**doubles** agreement that produced a non-reversed result; the pair **won** iff
their side equals `winningSide`. Aggregate per partner into `{ partnerId, wins,
games }`; best/jinx = highest/lowest win-rate with a **min-games guard (≥3
together)**. Computed from `match_agreement_sides` + `match_agreements`
(format='doubles', `winningSide`, not reversed/cancelled), per member.

**Rationale**: The `matches` rows are per winner↔loser pair (good for H2H), but
*partnership* lives on the agreement sides — same side = teammates. Pure
selector over a bounded per-member set.

**Dependency**: requires **doubles** data — the heavy seed is singles-only, so a
foundational task extends `seed-heavy.ts` to emit valid doubles (agreement with
`pairingKind`, 4 sides, the per-pair `matches` rows + debts the record-result
model creates) so this is populated + testable.

## D6 — Beer aggregates

**Decision** (all SQL, voided excluded via `consumption_voids` left-join
`IS NULL`):
- **total beers** = count of the member's non-voided consumptions.
- **beers/night** = total ÷ distinct `drink_session_id` the member appears in.
- **favourite beer** = mode of `beer_type_id` (GROUP BY, order count desc).
- **rounds poured** = distinct `round_id` where the member is `created_by` of a
  consumption for **another** member (`member_id != self`).
- **beers bought for others** (board 🤝) = count of non-voided consumptions
  where `created_by_user_id` = member's user AND `member_id` ≠ member.
- **current tab** = existing `memberBalance(memberId)`.

**Rationale**: Direct, indexed aggregates; reuses the canonical balance fn.

## D7 — Fun-line engine: pure selection, i18n rendering

**Decision**: `selectFunLines(stats): { key: string; params: Record<string,…> }[]`
— a pure function returning an **ordered** list of qualifying lines (each with a
guard, e.g. streak ≥ 3 → `funline.undefeated`; lopsided H2H ≥ 5–0 →
`funline.subscription`; beers/night ≥ 3 → `funline.professional`; rounds ≥ 10 →
`funline.sugarDaddy`; owes someone ≥ 2 → `funline.payUp`; no win in 30d →
`funline.believe`). The page renders the top 1–2 via `t(key, params)` (ICU,
cs/en). A member with no qualifying line shows none (or one gentle default).

**Rationale**: Selection logic is pure + unit-testable (which lines, what
params); copy + plurals live in the catalog; tone is curated centrally. Never
mean-spirited — the line set is hand-written warm/teasing.

**Alternatives**: building strings in code (rejected — breaks i18n + the
forms/i18n gate); LLM-generated lines (rejected — non-deterministic, untestable,
offline-unsafe).

## D8 — Entry points + routing

**Decision**: New routes `/(app)/leaderboards` and `/(app)/members/[memberId]`.
Leaderboards reachable from a **bottom-nav entry** + a link on the **match hub**;
a member's profile reachable by **tapping their name/avatar** (leaderboard rows,
match lineups) and the viewer's **own** profile from **/account**. Scope toggle
is a `?scope=season` query param (link-based segmented control — no client state,
SSR-friendly, shareable).

**Rationale**: Discoverable where competition already lives (match hub) +
always-available (nav). Query-param scope keeps the page a server component with
no hydration cost.
