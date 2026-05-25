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

- **One-tap "log a beer" on app open.** When the user opens the app
  authenticated (lands on `/`), the most common action is to log
  their beer. Make it a single tap from the home screen — a big
  primary button at the top, OR auto-open the log-beer flow when
  there's a recent open session and the user hasn't logged in the
  last N minutes. Today logging requires: home → tap "Log a beer"
  CTA → /log → pick beer type → confirm. Cut to one tap.

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
