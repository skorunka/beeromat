# beeromat backlog

Informal capture of feature ideas that aren't yet specced via `/speckit`.
When one matures, run `/speckit-specify` and the item moves into
`specs/NNN-…/`.

---

## UX

- ~~**Persistent "I owe X to the club" badge on every page.**~~
  **— Shipped 2026-05-26.** AppHeader now renders a small amber
  `<BalanceBadge />` pill between the club name and the user-menu
  avatar when `balanceMinor > 0`. Tappable → `/tab`. Hidden when
  square. Reuses `memberBalance()` in `(app)/layout.tsx` (one extra
  query per render; small cost on this app's scale).

- ~~**One-tap "log a beer" on app open**~~ **— Shipped 2026-05-26 as
  spec 017** (`specs/017-home-onetap-log/`). Option 2 "same as last
  time" landed with the predictive-default button + fallback link
  to the full picker; archived + out-of-stock fall through gracefully.
  Home is now the action surface, not just an info display.

- ~~**Match-bet awareness on home**~~ **— Shipped 2026-05-26 as
  spec 018 MVP** (`specs/018-match-bet-home-awareness/`). Auto-create
  on settlement (Option A): match-settle transaction writes the
  winner's consumption + loser's bet_transfer atomically; loser
  sees "Útrata z dnešního zápasu: N× pivo" on home with a "Vrátit
  zápas" link. Match-void cascades to consumption + stock restore.
  Deferred follow-ups: (a) optional beer-picker UI in the
  match-result form (data-side ready via `betBeerOverrideId`),
  (b) /tab + admin "ze zápasu →" visual distinction.

- ~~**Log a beer on behalf of another member.**~~ **— Shipped
  2026-05-26 as spec 019** (`specs/019-log-for-other-member/`).
  "Zapsat pro jiného člena" link on home + /log opens a
  member-picker → beer-picker flow. Consumption created immediately
  (member_id=target, created_by_user_id=actor); absent member's
  home shows a review banner with one-tap "Vrátit" / "Nechat".
  Reject voids + restores stock; nobody auto-pays. /tab row
  expanded to 4 origin types (self / on-behalf "od X" /
  won-bet "ze zápasu →" / lost-bet "z prohrané sázky").
  voidConsumptionAction authz extended so the consumer can reject
  their own on-behalf logs.

- **Spec 019 follow-up — admin balance view origin-type distinction.**
  FR-007 of spec 019 says EVERY consumption-listing screen
  surfaces the 4 origin types. Spec 019 MVP ships the
  distinction on `/tab` only; `/admin/balances/[memberId]` is
  left for a small follow-up. Should reuse the extended
  `getMyTabForSession` shape (or a sibling helper for the
  treasurer's all-sessions view) — the row rendering component
  (`<TabEntryRow />` from spec 019) drops in directly. ~30min
  once the spec 019 components land.

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

- **Pay-debt button on /tab.** Today the /tab page shows the
  session-total but the only settle CTA lives on home (when
  owing). Add a clear "Vyrovnat útratu" button at the top or
  bottom of /tab that goes straight to /settle. Render only
  when the member has an outstanding total. Small inline polish.

- **Header brand → home link.** Tapping the 🍺 BEEROMAT + club
  name on the AppHeader should navigate to `/` (home). Today it
  isn't a link; users expect "click the logo" to go home (web
  convention). Wrap the BrandMark + club-name group in a `<Link
  href="/">`. Small, one-line edit. Hidden cost: needs to play
  well with the existing flex layout + the balance pill
  alongside.

- **Fun avatar picker.** Today the user-menu shows the member's
  initials in a primary-tinted circle. Add an "Edit avatar"
  option that lets the member pick from a small predefined set
  of playful images — beer mug 🍺, tennis ball 🎾, court 🏟️,
  mate-emoji set, etc. Stored on the user (probably a small
  enum or a string id pointing at an image asset). Falls back to
  initials when nothing's picked. Enjoyable + personal touch
  that fits a club app. Schema: small new `users.avatar_key` or
  `members.avatar_key` (decide during spec).

- **Refine language picker in the user-menu.** The CS/EN
  switcher in the avatar dropdown currently uses two equal-sized
  button-style tiles that feel out of place next to the menu's
  text-row items. Pattern doesn't match the rest of the dropdown
  (Account row + Sign out row are simple text links). Replace
  with something more in line: e.g. a single row "Jazyk · cs |
  en" with the inactive option as a small clickable text link,
  or a tiny segmented control inline with the row. Same a11y +
  same functionality, less visual weight.

- **Money format without cents by default for compact UI.**
  The header balance badge (`<BalanceBadge />`, just shipped)
  uses `formatMoney()` which renders fractional units; for CZK
  that's "380,00 Kč" — wide for a pill. Update `formatMoney` or
  add a compact variant that drops the decimals when they are
  all zero (or always). Saves space in headers and tight
  layouts. Verify it doesn't regress places that need cents
  (e.g. EUR amounts in the admin reconciliation view).

- ~~**Refine the bottom nav.**~~ **— Shipped 2026-05-26.** Log
  and Tab dropped from the bottom nav. Bottom nav is now
  Home / Bet / History (+ role-gated). Rationale: home
  (spec 017+018) is the action surface for log + balance + bet
  awareness + settle; the AppHeader balance pill (shipped today)
  provides the secondary route to /tab; the "Vyber jiné pivo →"
  link on home keeps /log reachable. Both pages remain functional
  as deep links — only the nav entry is gone. If the simplification
  proves too aggressive (muscle memory complaints), the entries
  re-add in one line of layout.tsx.

