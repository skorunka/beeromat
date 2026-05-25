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

- **Bulk-migrate the remaining 32 specs to `authedTest`** (started in
  spec 014 E2E perf work). Each migration: remove the
  `test.use({ storageState: {…} })` opt-out, swap the import to
  `authedTest`, drop the `signInAndUnlock` call(s) at the top, and
  swap any references to a per-spec `ADMIN_EMAIL` constant to
  `ctx.admin.email`. Mechanical but file-by-file.

- **Per-worker DB + raise `workers`** (option B from the perf
  analysis). Bigger effort (1-2 days), larger speedup on top of the
  storageState work. Park until the storageState migration is done
  and we measure the new baseline.
