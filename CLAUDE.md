<!-- SPECKIT START -->
No spec currently in flight. Most recent shipped specs: 025
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
