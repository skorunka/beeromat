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

- ~~**Spec 019 follow-up — admin balance view origin-type distinction.**~~
  **— Shipped 2026-05-26.** `/admin/balances/[memberId]` now
  renders the same 4 origin types `<TabEntryRow />` already
  shows on /tab. New sibling query `getMemberTabForAdmin` in
  `lib/db/queries/consumption.ts` (treasurer-shape — no `userId`
  arg because admin has no undo affordance, `canUndo` always
  false). Scoped to the current open session (older entries live
  in the member's /history); fetched alongside the balance +
  pending payments in the same `Promise.all`.

- **Club name visible in the AppHeader.** Currently the global
  header on every authenticated page shows BrandMark (🍺 BEEROMAT)
  + LanguageSwitcher + SignOutButton. Add the active club's name as
  ambient identity next to the brand — small, secondary weight, so
  members are always reminded which club they're acting on (matters
  for the future multi-club case but useful now too).

- ~~**Date duplication on history list.**~~ **— Audited 2026-05-26,
  no duplication present in current code.** Walked through
  `/history`, `/history/[sessionId]`, `/account/payments`,
  `/admin/pending`, `/admin/members`, `/admin/beer-types/[id]/history`
  — each row renders the date once (or date + time together via one
  Intl.DateTimeFormat). Session titles default to null with a
  generic "Round / Kolo" fallback, no date is embedded there.
  Probably fixed during unrelated polish in an earlier session.
  Reopen if a screenshot surfaces.

- ~~**Pay-debt button on /tab.**~~ **— Shipped 2026-05-26.**
  /tab renders a prominent "Vyrovnat útratu" button below the
  session-total card when `memberBalance > 0`. Reads
  `memberBalance(ctx.member.id)` in the same `Promise.all` as
  the tab query.

- ~~**Header brand → home link.**~~ **— Shipped 2026-05-26.**
  AppHeader wraps BrandMark + the · separator + club-name in
  `<Link href="/">`. The right-side group (balance pill +
  user-menu avatar) is outside the link so taps on those don't
  navigate home.

- **Fun avatar picker.** Today the user-menu shows the member's
  initials in a primary-tinted circle. Add an "Edit avatar"
  option that lets the member pick from a small predefined set
  of playful images — beer mug 🍺, tennis ball 🎾, court 🏟️,
  mate-emoji set, etc. Stored on the user (probably a small
  enum or a string id pointing at an image asset). Falls back to
  initials when nothing's picked. Enjoyable + personal touch
  that fits a club app. Schema: small new `users.avatar_key` or
  `members.avatar_key` (decide during spec).

- ~~**Refine language picker in the user-menu.**~~ **— Shipped
  2026-05-26.** The 2-tile CS/EN button grid was replaced with
  native `DropdownMenuRadioGroup` rows — one per locale, with a
  check mark on the active one. Labels use endonyms ("Čeština",
  "English") so a member sees their language by name regardless
  of current UI locale. Visual weight now matches the surrounding
  Account / Sign out rows; the JAZYK uppercase header is gone
  (the radio group implies "pick one").

- **Money format without cents by default for compact UI.**
  The header balance badge (`<BalanceBadge />`, just shipped)
  uses `formatMoney()` which renders fractional units; for CZK
  that's "380,00 Kč" — wide for a pill. Update `formatMoney` or
  add a compact variant that drops the decimals when they are
  all zero (or always). Saves space in headers and tight
  layouts. Verify it doesn't regress places that need cents
  (e.g. EUR amounts in the admin reconciliation view).

- ~~**Fancy beer animation on log.**~~ **— Shipped 2026-05-26.**
  Every successful log (one-tap, /log grid, /log/for) fires a
  global 🍻 + 🍺-fountain overlay. Centerpiece 🍻 pops in
  scaled, eight 🍺 mug particles fountain outward in a 90°
  arc (~1.2s total). Dispatched via `celebrateBeer()` in
  lib/celebrate.ts → `<BeerCelebration />` mounted in the
  locale layout listens on a window CustomEvent and renders
  the overlay. CSS-only animation; motion-reduce:hidden skips
  the overlay entirely for users who've requested reduced
  motion (the toast still confirms verbally).

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

