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

## E2E performance (in-flight)

- **Bulk-migrate the remaining 30 specs to `authedTest`** (started in
  spec 014 E2E perf work; `ux-loading` + `ux-bet-no-session` migrated
  as the first wave). Not mechanical — each spec needs case-by-case
  judgment:
    - Many specs need a `seed.payment` / `seed.consumption` /
      `seed.beerType` builder bound to the shared admin's club. **Step
      one**: expand the `AuthedContext` interface in
      `tests/e2e/fixtures/test.ts` with these builders so migration of
      the seed-heavy specs (`ux-pending-row`, `us2-settle`,
      `us3-treasurer-confirm`, etc.) becomes a 5-line file edit.
    - Specs that test multiple roles per test (`forms-money`,
      `ux-touch-targets`, `ux3-redesign`) need a "switch role" helper
      OR splitting into multiple test files. Hard.
    - Auth-flow specs (`auth`, `forms-auth`, `onboarding`,
      `us5-invite-onboard`, `ux-forgot-pin`, `email-i18n`,
      `admin-config` bootstrap test) MUST keep the opt-out — they
      test sign-in/onboarding/invitation directly.

- **Per-worker DB + raise `workers`** (option B from the perf
  analysis). Bigger effort (1-2 days), larger speedup on top of the
  storageState work. Park until the storageState migration is done
  and we measure the new baseline.
