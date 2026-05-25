# beeromat backlog

Informal capture of feature ideas that aren't yet specced via `/speckit`.
When one matures, run `/speckit-specify` and the item moves into
`specs/NNN-…/`.

---

## UX

- **Persistent "I owe X to the club" badge on every page.** Currently
  the user's outstanding tab appears only on `/` (home) and `/tab`.
  Make it ambient — small chip in the AppHeader (spec 013 added the
  header to every authenticated page) showing `Tvoje útrata: 380 Kč`
  or `Vyrovnáno`. Tappable → jumps to `/tab`. Hidden when balance =
  0 to avoid visual noise.

- **One-tap "log a beer" on app open** *(expanded)*. The most common
  action is to log a beer. Make it a single tap from `/`. Concrete
  question to resolve: *how does the user pick the beer type?*
  Options:
    1. **Big primary "Log a beer" button on `/` that opens an inline
       beer-picker modal** — one tap to open picker, second tap to
       pick beer = 2 taps total. Beats today's 3-screen flow.
    2. **"Same as last time" memory** — if the user logged Pilsner
       last, the home button is "🍺 Log a Pilsner (last one)". One
       tap. A small "different beer" link opens the picker for the
       exception case.
    3. **Multiple beer buttons on home** (one per active beer type)
       if the club has ≤4 beers. One tap, no picker. Hurts when the
       catalog grows past ~5 beers.
  Recommended: start with (2) — predictive, single tap for the 80%
  case, falls back to (1) for the rest.

- **Log a beer on behalf of another member.** When someone forgets
  their phone, a mate logs the beer for them. Today there's no UI
  for this — every consumption is implicitly for the signed-in user.
  Design questions:
    1. Where does the affordance live? Probably the /log screen:
       "Log for someone else" link below the beer grid → opens a
       picker (whose beer is this for?) → then the beer type.
    2. Does the absent member need to CONFIRM the beer when they
       open the app? Without confirmation, mates can troll each other
       ("I logged 5 Kozels for you"). With confirmation, the absent
       member sees a list of "pending logs for you" and accepts /
       rejects each.
    3. Reject path: if rejected, the beer goes BACK to the original
       logger's tab? Or is voided entirely? (Cleaner: voided —
       constitution V compensating-row pattern. Original logger sees
       a notification "Pavel rejected the Pilsner — try again".)
    4. UI placement of the pending-confirmations list: a banner on
       `/` for the absent member when they sign in, similar to the
       existing dispute banner.
  Likely a v1.15-ish spec — `/speckit-specify` when ready.

- **Club name visible in the AppHeader.** Currently the global
  header on every authenticated page shows BrandMark (🍺 BEEROMAT)
  + LanguageSwitcher + SignOutButton. Add the active club's name as
  ambient identity next to the brand — small, secondary weight, so
  members are always reminded which club they're acting on (matters
  for the future multi-club case but useful now too).

- **Date duplication on history list.** Each row in
  `/history` (and possibly `/account/payments`) shows the date
  twice. Audit the list-row components + the formatter helpers in
  `lib/format/` and dedupe — likely a row header that also has a
  per-row date stamp, or two date fields shown side-by-side from
  the same row.

---

## E2E performance — follow-ups to spec 015

Spec 015 shipped the **infrastructure** for the four-layer pyramid
(Component / API-mocked E2E / db.setup Playwright project /
Constitution Principle VIII) — but the bulk spec migrations
(US3 + US4 + Polish) were **deferred**. Two reasons surfaced during
implementation that mean the original tasks.md categorisation was
optimistic:

1. **Component-layer migrations need production-code refactoring.**
   Most ux-* specs target Next.js server-component pages (`/log`,
   `/admin/pending`, `(app)/layout.tsx`'s dispute banner, the
   `loading.tsx` skeleton) — none of which can be rendered in
   isolation under Playwright CT or RTL. Migrating them requires
   first extracting their visual sub-components into pure
   presentational React components, which is outside spec 015's
   scope ("DOES NOT include changing production code paths").

2. **Mocked-E2E migrations save less than expected.** Most
   form-validation tests in the suite seed DB state so the form
   actually RENDERS (balance > 0, member exists, banking profile
   present). The mocked-E2E layer's "no DB writes via web" benefit
   only applies to the action-submission step, which most tests
   never reach (Zod blocks bad input client-side). After spec
   014's storageState removed the per-test sign-in cost, the
   remaining wall-time tax is the seed work — which mocked-E2E
   doesn't address.

### Follow-up specs to queue

- **(016?) Presentational-component extraction** — refactor a handful
  of `(app)/*` server components to delegate UI to pure
  presentational components under `components/`. Targets identified
  during 015: dispute banner, loading skeletons, empty-state views
  for /log + /bet + /history, locale-rendered headings. ~10
  refactors, each tiny. Once these exist, the corresponding ux-*
  specs migrate to the component layer for real wall-time wins.

- **(017?) Per-spec true-migration audit** — case-by-case decision
  for each of the ~30 remaining E2E specs: stay at true-E2E
  (critical journey), move to mocked-E2E (genuine no-seed win),
  or block on (016)'s refactor. Replace the spec-015 tasks.md R8
  table with an evidence-based one based on actual measured costs.

- **Per-worker DB + raise `workers`** (option B from the perf
  analysis). Bigger effort (1-2 days), larger speedup on top of
  storageState. Park until the layer split has measurable wins.

- **Backfill `specs/014-e2e-perf-storagestate/`** — the storageState
  work landed as commits on `main` without a spec directory. Future
  readers expect a 014 dir. Backfill with a brief retrospective
  spec.md documenting what shipped + the constraints we discovered
  that led to spec 015.
