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

