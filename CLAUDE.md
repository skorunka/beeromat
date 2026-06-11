<!-- SPECKIT START -->
Most recently shipped: spec 031 (admin-data-correction — surgical
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
