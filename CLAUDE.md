<!-- SPECKIT START -->
Most recently shipped: spec 036 (member-profile-links — small presentational
follow-up to 034+030. Member names now tap-through to /members/[id] on the
beer-IOU rows (BeerIouRow: counterparty avatar+name wrapped in a Link to
/members/[counterpartyMemberId]; deliver/write-off buttons stay siblings — no
nested anchor) + the /tab on-behalf "od {logger}" line (TabEntryRow: avatar+name
→ /members/[loggerMemberId]; Runda badge outside the link; text-only fallback +
won/lost-bet sentences unchanged). The home "match card" IS the IOU rows
(MatchBetModule renders BeerIouRow). NO query/schema change — ids already on
BeerDebtRow + MemberTabEntry. Hard rule honoured: no <a> nested in <a>.
DEFERRED (BACKLOG): match-hub recent-results per-player links (whole-row is
already a match Link → nesting) + won/lost-bet mid-sentence logger names (need
t.rich). Tests: component only — beer-iou-row.spec (2) + tab-entry-row.spec
extended (2) + match-bet-module.spec given the Link mock; no unit/integration/
E2E. Verify-data: scripts/seed-036-verify.ts (pnpm db:seed:verify036) seeds an
on-behalf beer + an IOU each direction for the viewer. Full SDD in
specs/036-member-profile-links/.

Most recently shipped: spec 035 (achievements-badges — persistent, sticky,
earned-at-write badge layer on spec 034's stats, PLUS a game-style badge
GALLERY on the profile. ONE new table member_achievements (club_id, member_id,
badge_key, earned_at; UNIQUE(member_id,badge_key)) — migration 0015, additive.
Badge CATALOG lives in CODE not DB: lib/achievements/{types,predicates,catalog}.ts
— 9 badges (💯 centuryClub/🏆 winner/📈 sharpshooter/🔥 onFire/🎩 hatTrick/
🤝 roundKing/🎾 regular/🍺 connoisseur/🦉 nightOwl), each a pure earn predicate
+ progress fn over MemberStats (extended with distinctBeerTypes + sessionsAttended
in getPlayerStats). lib/db/queries/achievements.ts: reconcileAchievements
(insert-if-absent → newly-earned keys, STICKY — never revoked, idempotent via the
unique index as conflict target), reconcileAndCollect (multi-member, swallows
errors → never fails the action, returns the ACTOR's keys), getEarnedBadges,
getClubBadgeRarity (US3), reconcileAllClubMembers (backfill). RECOGNISE-AT-WRITE
(never on render): reconcile is called POST-COMMIT in logBeerAction (actor),
logBeerOnBehalfAction (target silently), logRoundAction (drinkers + actor),
recordResultAction (all participants); each success result carries
unlockedBadges. Client celebrateUnlocks() (components/achievements/) fires the
existing 🍻 overlay + a toast per badge, called from home-one-tap-log/
round-logger/beer-grid/RecordResultForm. GALLERY (components/achievements/
{achievements-section,badge-chip}.tsx on /members/[memberId]): shows ALL 9 badges
— earned vivid + "Earned {date}" sorted first, locked dimmed + condition +
progress bar ("64 / 100"), "N of 9" count, optional rarity ("3 of 28 members").
Progress is a pure in-render fn over the stats the profile already loads (NO
write-on-read, NO new per-badge query). achievement.* i18n (cs/en, name+desc+
condition per badge). achievements-section in the i18n-check EXCLUDED set (arrow
false-positive). Backfill: pnpm db:backfill:achievements (scripts/, single
release earned_at stamp) — folded into vercel-build (migrate && backfill &&
build), idempotent/insert-if-absent so it's safe on every deploy and veterans
see historical badges with zero manual steps. Tests: unit 10 (predicates/
progress/catalog) + integration (reconcile-achievements 4 sticky/idempotent/
backfill, award-on-action 3) + component (achievements-section 6). No E2E
(display + write-side-effect, not a journey). Full SDD in
specs/035-achievements-badges/. BACKLOG after 035: tiered badges, relative/
point-in-time (Giant-killer, was-#1) needing event capture, secret badges,
gallery sort/filter + badge-count board, lean getBadgeStats reconcile.)

Most recently shipped: spec 034 (leaderboards-profiles — read-only stats
layer, NO schema change. Two surfaces: /leaderboards (7 aggregate
boards — beers/tab/wins/played/winRate/streak/boughtForOthers, all-time
vs rolling-90d "season" toggle via ?scope, podium top-3 + viewer-row
highlight) and /members/[memberId] profile (record/streaks/nemesis+
favouriteVictim/best+jinxPartner/beersPerNight/favouriteBeer/
roundsPoured/tab) + a playful fun-line engine. Architecture: ONE SQL
GROUP BY per board run via Promise.all (NEVER per-member loops; target
<1.5s on the heavy seed), plus pure unit-tested selectors in lib/stats/
{streak,head-to-head,partners,beers-per-night,fun-lines}.ts. Queries:
lib/db/queries/{leaderboards,player-stats}.ts. Excludes voided
consumptions + reversed/cancelled/voided matches. Min-games guards
(winRate ≥10; partner/H2H ≥3). Partners come from match_agreement_sides
(same side = teammates) → needs DOUBLES data, so a foundational task
extends scripts/seed-heavy.ts (currently singles-only) to emit valid
doubles. As built: routes /leaderboards (?scope) + /members/[memberId];
entry via the match hub + account "My stats" + leaderboard rows.
FunLines (selectFunLines, 6 lines, funline.* ICU plurals) on the
profile. Heavy seed now emits doubles (~115 doubles / ~193 singles) so
partner stats populate. Tests: unit (streak/selectors/fun-lines, 13) +
integration (leaderboards 2 + player-stats 2) + component (board 5 +
profile 2 + fun-line 4); E2E N/A. Verified live on the heavy dataset
(all 7 boards + full profile + fun-lines, 0 errors). Full SDD in
specs/034-leaderboards-profiles/. BACKLOG after 034: per-stat config
UI, season archives, achievements/badges, match-lineup→profile links.)

Most recently shipped: spec 033 (log-a-round — batch on-behalf "pour a
round" logging. The home in-card "log for another member" control became
components/home/round-logger.tsx (home-log-for-other.tsx deleted): a
multi-select avatar grid (components/picker/member-multi-select.tsx,
aria-pressed toggles) + a default beer + optional per-person override
(opt-in "Někdo chce jiné pivo?" section) + one "Zapsat rundu · N piv"
button. New logBeerAction/logBeerOnBehalfAction sibling logRoundAction
(app/.../log/actions.ts) writes N consumptions in ONE tx — each beer on
that drinker's OWN tab (each owes their own; NO money-transfer model),
lazy session-open so an all-skipped round writes nothing. Self-beer =
item whose member==creator → no "logged for you" review; teammates →
one review each (EMERGENT from the existing predicate, no branching).
Out-of-stock/unavailable/not-in-club items are SKIPPED + reported
(partial success); all-skipped → ok:false ALL_SKIPPED. NO schema change
/ NO migration — a "round" is transient client state; only ordinary
consumptions rows persist. New listActiveMembersForRound (roster incl
self, isSelf flag), logRoundSchema (distinct memberIds). round-logger
added to the i18n-check EXCLUDED set (arrow/ternary regex
false-positive, strings via t('round.*')). Tests: unit
round-schema (4) + integration log-round-action (5: N-tab fan-out,
review distinction, partial skip, all-skipped, not-in-club, mixed beer)
+ component round-logger (6). E2E N/A (declared). Full SDD in
specs/033-log-a-round/. BACKLOG after 033: per-person quantity >1;
whole-round undo; surfacing the round as a grouped history entry.

Most recently shipped: spec 032 (event-attendance — RSVP for recurring
weekly sessions, replacing sejdemse. New events domain:
event_series / event_occurrences / event_rsvps + a nullable
occurrence_id FK on drink_sessions (optional/additive — beer & matches
NEVER gated on events; a non-event session has occurrence_id null and
behaves as before). Migration 0013. Admin (/admin/events) creates
weekly series (weekday + Europe/Prague local time + place); a nightly
Vercel cron (/api/cron/events, CRON_SECRET-guarded, idempotent
ensureOccurrences, vercel.json schedule 0 2 * * *) keeps occurrences
generated ~5 weeks ahead. "Open for RSVP" is DERIVED, never stored:
open ⇔ scheduled AND date in current Prague week (Mon–Sun) AND
now<startsAt — so only this week's not-yet-started sessions accept
RSVPs (Mon shows the whole week, Fri only what's left). Members set
ONLY their own going/not-going on /events + /events/[id]
(setMyRsvpAction); admin-only on-behalf via setMemberRsvpAction +
AdminMemberRsvp (the sejdemse fix — no accidental edits). Occurrence
detail = who's-coming roster + going-headcount + playful low-turnout
line + optional 'beers from this night' link. Admin can cancel an
occurrence / deactivate a series (soft). Pure Europe/Prague logic in
lib/events/{prague-time,window}.ts (DST-aware local→UTC, current-week,
isOccurrenceOpen, generation dates, low-turnout) — unit-tested incl. DST.
Events bottom-nav entry ('Sraz'). DEPLOY NOTE: set CRON_SECRET in Vercel
env (the cron auth). Full SDD in specs/032-event-attendance/. BACKLOG
after 032: set-the-beer-link admin action (US5 surfacing exists, the
association UI is deferred); per-occurrence notes thread; reminders.),
then spec 031 (admin-data-correction — surgical
admin corrections to keep balances honest; club-wide reset was
descoped at user request. Admin member-detail
(/admin/balances/[memberId]) gained club_admin-only controls:
"Opravit útratu / Correct charges" lists the member's all-time
non-voided consumptions (new getMemberChargesForAdmin in
lib/db/queries/consumption.ts) each with a delete control
(AdminVoidConsumptionButton → existing voidConsumptionAction, whose
stock_manager override already covers club_admin, no age/settled
gate); "Vrátit platbu / Reverse payment" lists confirmed payments
(new getMemberConfirmedPayments in payments.ts) each with a reverse
control (AdminReversePaymentButton → existing voidConfirmedPaymentAction,
confirmed→voided, reason 'admin-correction'). Both reuse the AUDITED
compensating-row paths — no new transaction, no hard delete, balance
invariant preserved (voiding a settled charge → member credit). Controls
gated on roleSatisfies(role,'club_admin') though the page is
treasurer-reachable. US3 (match/bet reversal) needed no change —
canRecordMatchResult already admits club_admin on /match. Tests:
tests/integration/admin-data-correction.spec.ts (5) +
tests/component/admin-{void-consumption,reverse-payment}-button.spec.tsx
(6). Full SDD in specs/031-admin-data-correction/. Also shipped
alongside (no spec): account back-links, "initial stock" localization
(stored marker 'initial' → admin.stockReasonInitial), and the stock
"Adjust"→"Upravit zásobu / Edit stock" relabel.), then spec 030
(match-bet-iou — match bets no longer
auto-settle at result time. recordResultTx creates a PENDING
match_bet_debt per loser↔winner pair (no money/stock); both parties
see the IOU ("Dluží ti pivo {x}" / "Dlužíš pivo {x}") on home + the
/match "Sázky k vyrovnání" list. Either party taps "Předáno" →
deliverBeerDebtTx (lib/db/queries/match-bet-debts.ts) books the cost
via the existing consumption + bet_transfer path (all-or-nothing,
optimistic-claim on status pending→settled, idempotent) → loser pays,
winner unchanged, debt settled. Bet beer chosen at match create
(match_agreements.bet_beer_type_id, new picker on
NewMatchAgreementForm when forBeer) and overridable at delivery.
reverseResultTx voids still-pending debts (no money) / unwinds
delivered ones. Result heading → Vítěz/Vítězové. The casual
"Vyrovnat sázku / take someone's drink" bet system was REMOVED
entirely (UI: BetSettleSection + components/bet/transfer-list;
actions: app/.../bet/actions.ts createBetTransferAction +
voidBetTransferAction; query: lib/db/queries/bets.ts; the whole `bet`
i18n namespace; 4 integration tests). Won beers now appear in history:
/history/[id] renders entries via the shared TabEntryRow (same as
/tab) so won-bet beers show "z vyhrané sázky: platí {loser}"
(struck-through, links to the match) and lost-bet "z prohrané sázky";
the separate bet-transfers section is gone (getSessionDetail no longer
returns `transfers`). New shared components/match/beer-iou-row.tsx
(deliver control); home match-bet-module rewired to render IOUs.
Migration 0011_marvelous_wallflower. Full SDD artifacts in
specs/030-match-bet-iou/. BACKLOG after 030: a "your bets" ledger
view; unsettled-IOU nudges.

Most recently shipped: spec 029 (inline-log-for-other — home's
"log for someone else" is now an inline collapse/expand control
instead of a link to /log/for. Expands to MemberPickerDropdown +
new common `components/picker/beer-picker-dropdown.tsx` + Log;
logs via existing logBeerOnBehalfAction → celebrate + toast +
router.refresh() (round breakdown updates in place, NO navigation);
selections persist for fast round-logging. Home loads
listOtherActiveMembers (replaced the count query) + renders only
when other members exist. /log/for kept as deep-link fallback;
unused LogForOtherLink removed. beer-picker-dropdown added to the
i18n-check EXCLUDED set (same =>/generic regex false-positive as
member-picker-dropdown; strings via props). Component tests for
both new components. No schema change. Dedupe of the 3 beer
dropdowns onto the shared one is a BACKLOG follow-up.

Most recently shipped: spec 028 (tab-beer-breakdown — per-beer
breakdown on /tab grouped by (beer type, day), "{beer} ×{count} ·
{subtotal}", sorted by subtotal desc / day newest-first. Pure
helper `lib/tab/group-beer-breakdown.ts:groupTabEntriesByBeer`
over the existing getMyTabForSession entries — counted predicate
identical to the tab total (non-voided, non-transfer_out;
transfer_in included) → breakdown total == tab total by
construction. `TabBeerBreakdown` component (uses useTranslations,
sync) rendered above the existing chronological list, which keeps
per-beer undo. No new query, no schema change. Unit test (helper,
9 cases) + component test (6). /settle + /history breakdowns
deferred to BACKLOG. specs/028-tab-beer-breakdown/ has the full
artifacts), then spec 027 (recreate-last-match — one-tap
"Recreate last match" on the /match hub. Resolves the MEMBER's
most recent participated agreement (any state —
open/recorded/cancelled) via new `lastAgreementForMember` query,
labels the button with the matchup ("Recreate: Franta + Pepa vs
Honza + Standa"), and on tap clones lineup/format/for-beer/pairing
into a new OPEN agreement via `recreateLastMatchAction` → existing
createAgreementTx. The action re-resolves the source server-side
(no client-trusted lineup) and adds an active-participant guard
the shared tx lacks (STALE_PARTICIPANT — createAgreementTx checks
club membership but not is_active). Renders only when the member
has a prior match. No schema change. Per-row "repeat arbitrary
match" deferred to BACKLOG. specs/027-recreate-last-match/ carries
the full plan/data-model/contracts/tasks.

Post-026 polish + correctness
sweep (2026-05-27 evening, several small commits without a
formal spec dir): Match entry restored to bottom nav (was
deep-link-only); SessionTitleInlineEdit on /history list
(spec 022 had only wired /tab + /history/[id]); dropdowns
close on item select (MemberPickerDropdown + user-menu +
admin locale switcher); BeerSpinner on RecordResultForm
undo; getSessionHistory N+1 batched (3 queries regardless
of session count); getBetTransfersForSession join collapsed
(spec 023 follow-up); partial unique index on payments
to close payment-claim race; LostConcurrencyRaceError on
recordResultTx now returns ALREADY_RECORDED instead of 500
on double-submit; cancelAgreementAction gets the
canRecordMatchResult gate; inviteMemberAction scoped to
caller's club (was leaking cross-club email enumeration);
defense-in-depth club_id on beer-catalog UPDATE WHEREs.
All changes covered by new integration tests where the
path was untested.

Most recent shipped specs: 026
(polish-round-a-e — shared `BeerTile` h-16 component for
the two genuine tile consumers (/log/for + match-result
form); logger MemberAvatar on the home on-behalf review
banner; intentional-dropdown comment on home-one-tap-log.
Scope corrected mid-flight: item D dropped (/settle doesn't
render a treasurer name), item A reframed (/log's beer-grid
is a richer h-32 BeerCard with badges + stock count — not a
simple tile — so stays unchanged; BeerTile became
single-shape h-16 for the two real consumers)), 025
(bet-beer-tile-picker — replaces the collapsed `<details>` +
`<select>` on the match-result form with an always-visible
tile grid matching `/log`'s beer tiles. First tile is
"Auto · {recorder-last-beer}" pre-selected; tapping any
other tile sends `betBeerOverrideId` on submit. No schema
change; recorder's last-beer name added to the page's
Promise.all via `lastBeerForMember`. Four obsolete i18n keys
removed, two added), 024 (picker-avatars — replaces the three native `<select>` member
pickers with avatar-bearing custom controls: /log/for becomes
a tile grid matching the beer grid on the same form; /match
new + edit forms get an avatar dropdown per seat with
duplicate-seat protection. Two new shared components under
`components/picker/`; one new query helper `listOtherActiveMembers`),
023 (avatars-everywhere — <MemberAvatar /> next to member names
on /admin/pending pending + confirmed, /bet drinks-you-can-take
+ past-bets, /history/[id] bet transfers, /tab on-behalf
attribution; two new size variants on the component (inline
h-5, row h-8) reused from the spec-020 + spec-021 primitive;
five query shapes extended to carry memberId + avatarKey +
avatarUploadAt; native `<select>` picker conversion deferred
to spec 024), 022 (session-titles), 021 (avatar-upload), 020
(fun-avatar-picker), 019 (log-for-other-member + /tab
origin-row expansion), 018 (match-bet → home awareness), 017
(home redesign + one-tap log), 016 (onboarding happy-path
E2E). Each spec dir under `specs/NNN-…/` carries its plan.md
/ data-model.md / contracts/ as source of truth.

Live backlog (BACKLOG.md): inline polish items including pay-debt
button on /tab, money formatting without cents in the header,
language-picker refinement in the user-menu, fun avatar picker,
header brand → home link.

Testing strategy (Constitution v1.10.0 — four-layer pyramid,
clean separation, no glob bleed between layers):

  - **Unit** — Vitest, node env (`pnpm test:unit`). PURE FUNCTIONS
    ONLY: Zod schemas, authz predicates, format helpers, lint
    scripts. No DB, no filesystem, no network. Sub-second total.
    Location: `tests/unit/`. Config: `vitest.unit.config.ts`.
  - **Integration** — Vitest + PGlite (`pnpm test:integration`).
    DB-coupled code: Drizzle transactions, SQL queries, stateful
    DB rules. In-memory Postgres, no live Neon. Cold WASM warmup
    is ~10s on Windows (hookTimeout bumped to 30s).
    Location: `tests/integration/`. Config: `vitest.integration.config.ts`.
  - **Component** — Vitest + RTL + jsdom (`pnpm test:component`).
    Components in isolation with mocked data; server actions
    stubbed via `vi.mock()`. No webserver, no DB.
    Location: `tests/component/`. Config: `vitest.component.config.ts`.
  - **E2E (happy path only)** — Playwright (`pnpm test:e2e`).
    One spec so far (`tests/e2e/onboarding-happy-path.spec.ts`,
    spec 016). Each future critical journey gets its own spec
    that brings its test along; no journey-less E2E gets added.

`pnpm test` = unit + integration + component + i18n:check +
forms:check. `pnpm test:e2e` runs separately (needs Docker
postgres on :15432 and a cold `next build`).

When deciding where a new test belongs, default to the lowest
layer that can verify the behaviour. If you'd have to mock the
DB to keep a test in `tests/unit/`, it belongs in
`tests/integration/` instead. Don't mix layers in a shared
config or include glob.

Future crucial journeys still pending: log a beer, settle,
treasurer confirm, bet transfer, match agreement. Each goes
through its own spec dir with a Test layer declaration in its
plan.md.

Earlier shipped features live at `specs/001-beer-consumption-ledger/`
through `specs/013-matches-doubles-prematch/` — their `plan.md`,
`data-model.md`, and `contracts/` remain the source of truth for
the data model and server-action contracts. Spec 014 (E2E perf,
storageState reuse) and spec 015 (testing pyramid split) are
superseded by this reversal but their research and rationale stay
in the repo for context.

Constitution at `.specify/memory/constitution.md` — Principle VIII
(Testing Pyramid) is reinterpreted: layers 3 (API-mocked E2E) and
4 (true E2E) are deferred until a crucial-journey suite is spec'd.
<!-- SPECKIT END -->
