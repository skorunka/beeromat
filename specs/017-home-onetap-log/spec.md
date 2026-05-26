# Feature Specification: Home redesign + one-tap log-a-beer (v1.11)

**Feature Branch**: direct-to-`main`, trunk-based (per Constitution
governance — no feature branches at this team size).

**Created**: 2026-05-26

**Status**: Shipped (2026-05-26)

**Input**: User description: "one-tap log-a-beer on home — this is
main use case. Run panel discussion with personas for app usage. I
want a clean design — easy to use functionality. We have stitched
nice features but they are not connected, confusing for the user
what to do. They just want 1. log a beer fastly, 2. see the balance,
3. know if they owe beer from a lost match, 4. settle tab."

Spec 017 acts on the 2026-05-26 panel discussion run with the four
recurring personas (Tereza/iPhone, Pavel/Wednesday-doubles admin,
Standa/Czech-only-occasional, Jiří/treasurer). All four agreed home
is informational today but should be the single action surface for
the daily core loop. The current flow to log a beer is 2–3 taps and
a screen change — for the action that is the entire point of
opening the app.

Of the four user concerns the user named, this spec covers (1) log
a beer fast and (4) settle tab from home. Concern (2) "see the
balance" is already on home but is being re-framed as a friendly
sentence per Standa's feedback. Concern (3) "know if I owe beer
from a lost match" is deferred to **spec 018** (bet → consumption
auto-link), which depends on a real-world feature that doesn't
exist yet (match-bet rows don't materialise as consumptions today).
Role-aware home modules (treasurer pending count, admin nudges)
are deferred to **spec 019**.

## Personas *(mandatory — constitution v1.4.0)*

- **P1 — Tereza, 34 · regular member · iPhone, bilingual** *(primary)*:
  Logs a beer in the 20 seconds it takes to pack her bag after a
  Wednesday-night match. Currently has to tap bottom-nav Log → wait
  for /log to load → tap her beer type — 3 actions including a screen
  change. She is the daily-driver persona this spec optimises for.
- **P2 — Pavel, 45 · club admin · Wednesday-night doubles**: Uses the
  app 3× a week. Comfortable with the current flow but loses
  patience with the screen change when his fingers already know
  which beer he wants. Also represents the "group at the bar"
  context — three of them open the app at once after a match and
  each needs to log fast without bumping into each other's screens.
- **P3 — Standa, 67 · Czech only · stock manager (member role for log)**
  *(canary)*: Visits the app twice a month, treats every visit as
  new, reading glasses, large fingers, mis-taps often. Today's home
  shows him a big abstract number labelled "Outstanding balance" in
  small uppercase — he doesn't read labels, he reads sentences. He
  also doesn't get visible confirmation after logging today, so he
  often re-taps the same beer because he isn't sure it landed.
  Every word on the redesigned home must be a Czech sentence that
  reads like a person talking, not an app label.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One-tap log a beer (Priority: P1)

A returning member opens the app, sees a primary button preset to
their last-logged beer type, taps it once, and gets visible
confirmation that the consumption landed (toast + updated balance
sentence on the same screen). The action takes one tap from
opening the app to completed log.

**Why this priority**: This is the core daily flow — the action
the app exists to serve. Today it takes 2–3 taps and a screen
change. Cutting it to 1 tap is the single highest-leverage UX
change identified by the panel; all four personas independently
asked for it.

**Independent Test**: Open `/` as a member who has previously
logged a Pilsner. The home screen renders a button "Zapiš Pilsner".
Tap it. The button briefly shows a pending state, a toast appears
("Zapsáno · útrata 420 Kč"), and the balance sentence on the same
screen updates from "Tvoje útrata: 370 Kč" to "Tvoje útrata: 420 Kč"
without a navigation. The consumption row exists in the database
with the same shape as if logged through `/log`.

**Acceptance Scenarios**:

1. **Given** a signed-in unlocked member with at least one
   consumption on record whose beer type is in stock and not
   archived, **When** they open `/`, **Then** the primary CTA is
   labeled with that beer's name (e.g. "Zapiš Pilsner") and shows
   a beer-glass icon.
2. **Given** the same state, **When** the member taps the primary
   CTA, **Then** within 500 ms (after the round-trip) a toast
   confirms the log and the on-screen balance sentence reflects the
   new tab — no navigation occurs.
3. **Given** a member with no prior consumptions (very first log
   ever in this club), **When** they open `/`, **Then** the
   primary CTA reads the generic "Zapiš pivo" and tapping it
   navigates to `/log` (the existing full picker) — the spec does
   not pretend to know their preference.
4. **Given** a member whose last beer type has since been
   archived by the admin, **When** they open `/`, **Then** the
   primary CTA falls back to the generic "Zapiš pivo" path —
   archived beers are not surfaced as default suggestions.
5. **Given** a member whose last beer type is still active but
   currently out of stock (`currentStock <= 0`), **When** they
   open `/`, **Then** the primary CTA renders disabled with the
   beer name visible plus a short explainer ("Pilsner —
   nedostupné") and a secondary link prompts the picker ("Vyber
   jiné pivo →"). The member is never silently routed to a
   different beer.

---

### User Story 2 — Balance as a friendly sentence, not a label (Priority: P1)

The current home renders a large numeric balance under the small
uppercase label "Outstanding balance" / "K zaplacení". Standa
(P3) reads sentences, not labels. The redesigned home replaces the
label-plus-number card with a one-line Czech / English sentence
that reads naturally and never uses the word "dlužíš" (which the
user flagged 2026-05-26 as too accusatory for an after-match app).

**Why this priority**: P1 because the balance is on home anyway —
re-framing it is part of the same render path as US1 and free
once we are touching the home component. Without this change,
US1's "balance updates after one-tap log" assertion has nothing
to update on a P3-friendly home.

**Independent Test**: Open `/` as a member with a CZK 380 tab in
the Czech locale. The page renders "Tvoje útrata: 380 Kč" as a
sentence (with the amount typographically emphasised). Set the
member's tab to zero and re-render — the page renders "Vyrovnáno"
alone, no number, no settle button.

**Acceptance Scenarios**:

1. **Given** a member with a positive balance in the Czech locale,
   **When** they open `/`, **Then** the page shows the sentence
   "Tvoje útrata: 380 Kč" (or equivalent — exact wording lives in
   the i18n catalog and the spec asserts neither "dlužíš" nor any
   nagging variant appears).
2. **Given** the same member in the English locale, **When** they
   open `/`, **Then** the page shows "Your tab: CZK 380" or an
   equivalent neutral sentence.
3. **Given** a member with a zero balance in either locale,
   **When** they open `/`, **Then** the page shows the single word
   sentence "Vyrovnáno" / "All square" and no settle CTA renders.
4. **Given** the same member with a positive balance, **When** they
   open `/`, **Then** below the one-tap log button a secondary
   "Vyrovnat útratu" / "Settle up" CTA is visible — secondary
   weight so it doesn't compete with the log button.

---

### User Story 3 — Predictive default falls back gracefully (Priority: P2)

The "last beer" lookup MUST handle real-world catalog drift
(archive, stock-out, role visibility) so the predictive button
never surfaces a stale or unavailable suggestion. P2 because US1
ships without it for the simple case; this story makes US1 robust
for an established club where the catalog actually changes.

**Why this priority**: Beer catalogs change in active clubs — a
seasonal beer goes out of stock, a less-popular type gets archived.
A predictive button that points to an unavailable beer is worse
than no predictive button at all (it tells the member to do the
thing the system already knows can't be done). This story is the
robustness floor.

**Independent Test**: Seed three members: A with a last beer that
is active + in stock, B with a last beer that is archived, C with
a last beer that is currently `currentStock = 0`. Render `/` for
each. A's button is enabled and named. B's button shows the
generic "Zapiš pivo" and links to /log. C's button shows the
beer's name but is disabled with the "nedostupné" hint and a
"Vyber jiné pivo →" link beneath.

**Acceptance Scenarios**:

1. **Given** the member's last-beer lookup returns an archived
   beer, **When** the home page renders, **Then** the primary CTA
   falls back to the generic path identical to a first-time user.
2. **Given** the lookup returns an active beer with
   `currentStock <= 0`, **When** the home page renders, **Then**
   the CTA renders with the beer name + a disabled appearance + a
   "nedostupné" hint, and a secondary "Vyber jiné pivo →" link is
   present.
3. **Given** the member's role no longer permits seeing a beer
   that is in the catalog (rare — role-gated beers are a future
   feature, included here as a fallback safety net), **When** the
   home page renders, **Then** the CTA falls back to the generic
   path.
4. **Given** any of the fallback states above, **When** the page
   renders, **Then** the resolution does NOT require a second
   database round-trip — the necessary stock / archived flags must
   be folded into the existing home-page query.

---

### User Story 4 — Settle CTA stays reachable but secondary (Priority: P2)

The current home renders the "Settle up" CTA prominently when the
member owes — it is the only action on the screen. After US1
ships, the one-tap log button is the primary CTA and Settle must
become a secondary action, still reachable but not competing for
the thumb.

**Why this priority**: Settle volume is a tiny fraction of log
volume (members log many beers between settle events). Equal
visual weight would mis-rank actions on the daily home screen.
P2 because the current Settle CTA still works as a fallback — this
story just re-styles it to live below the log button.

**Independent Test**: Render `/` for an owing member. The DOM
order is: balance sentence → one-tap log button (primary,
prominent) → "Vyrovnat útratu" link or secondary button (visibly
less prominent than the log button). Render `/` for a square
member: the settle CTA is entirely absent from the DOM.

**Acceptance Scenarios**:

1. **Given** an owing member, **When** they open `/`, **Then** the
   settle CTA is present in the DOM, positioned below the log
   button, and styled as secondary (lower visual weight).
2. **Given** a square member, **When** they open `/`, **Then** the
   settle CTA is not present in the DOM at all.

---

### Edge Cases

- **Last beer for the member exists in a different club they were
  previously a member of.** Out of scope — the "last beer" lookup
  MUST be scoped to the active club's beer catalog. A member who
  joins a new club starts the predictive default fresh in that
  club.
- **Last beer for the member was logged as part of a voided
  consumption.** The lookup MUST ignore voided consumption rows
  (constitution V — voids are tombstones, not data). Otherwise
  voiding a bad log would still leave it as the predictive suggestion.
- **Member taps the one-tap button repeatedly in quick succession.**
  Each tap submits one consumption — the existing `logBeer` server
  action's atomicity guarantees apply unchanged. The button MUST
  show a pending state during the round-trip so the member sees
  feedback even on slow networks; double-tapping during the pending
  window is treated as a single tap (button is disabled while
  pending, see Constitution principle around no-double-submit).
- **Network failure or server error during the one-tap log.** The
  toast MUST surface the failure in the active locale and the
  balance sentence MUST NOT update. No silent failure.
- **Member opens the app while their balance is being updated by a
  treasurer's parallel action.** The next render reflects the latest
  balance; no special handling needed (existing server-component
  re-render path already handles this).
- **Beer type's `unitPriceMinor` changed between the member's last
  consumption and now.** The one-tap log uses the CURRENT price
  (the existing `logBeer` action snapshots `unitPriceMinor` at
  insert time). The label may show the new price; this is
  intentional — pricing changes are admin actions and the member
  pays the current price.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The authenticated home page (`/`) MUST render a
  primary call-to-action button that, when the member has a
  predictable last-beer, logs one consumption of that beer in a
  single tap without navigating away.
- **FR-002**: The "last beer" lookup MUST return the member's most
  recent non-voided consumption's beer type, scoped to the active
  club.
- **FR-003**: When the last-beer lookup returns null, an archived
  beer type, or a beer the member's role does not permit, the
  primary CTA MUST fall back to a generic "log a beer" label that
  links to the existing full picker (`/log`).
- **FR-004**: When the last-beer lookup returns an active beer
  whose `currentStock <= 0`, the CTA MUST render the beer's name
  in a disabled state with an explanatory hint and a secondary
  link that opens the full picker.
- **FR-005**: The home page MUST render the member's outstanding
  balance as a friendly sentence in the active locale (not a
  numeric value under a label). The sentence MUST NOT use the
  Czech word "dlužíš" or English equivalents that imply
  accusation.
- **FR-006**: When the balance is zero, the home page MUST render
  a single-word equivalent ("Vyrovnáno" / "All square") and MUST
  NOT render any settle CTA.
- **FR-007**: When the balance is positive, the home page MUST
  render a secondary "Vyrovnat útratu" / "Settle up" CTA below
  the primary log button. The settle CTA's visual weight MUST be
  visibly lower than the log button's.
- **FR-008**: After a successful one-tap log, the page MUST show
  visible confirmation (toast and updated balance sentence) within
  500 ms of the server round-trip completing. The member MUST NOT
  have to navigate or refresh to see the update.
- **FR-009**: After a failed one-tap log (network or server
  error), the page MUST surface the failure as a toast in the
  active locale and MUST NOT update the balance sentence.
- **FR-010**: The one-tap log button MUST be disabled while a
  log request is in flight to prevent double-submits.
- **FR-011**: The resolution of the predictive default
  (active / archived / out-of-stock / role-permitted) MUST be a
  pure function of the row returned by `lastBeerForMember`. The
  home page's render path MUST issue at most one additional SQL
  query compared to today (SC-005); the helper joins
  `consumptions` + `beer_types` in one round-trip so the variant
  decision is computable in the component without further DB
  access.
- **FR-012**: Every user-facing string introduced by this spec
  MUST resolve through the next-intl catalog in both `cs` and `en`
  (constitution: `i18n:check` gate). No literal strings outside
  the catalog.

### Key Entities

- **Member** *(existing)*: The signed-in user-in-club whose home
  page is rendered.
- **Consumption** *(existing)*: An append-only row created when a
  beer is logged. The "last beer" lookup queries the most recent
  non-voided row for the member.
- **BeerType** *(existing)*: The catalog row for a beer. Its
  `isArchived` flag and `currentStock` field gate the predictive
  default's behaviour.
- **No new entities are introduced by this spec.** The one-tap log
  writes a regular consumption via the existing `logBeer` server
  action; the home query gains additional column reads but no new
  tables.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning member with a predictable last-beer can
  log one beer from a cold open of the app (home screen visible) in
  ≤ 1 tap, down from the current 2–3 taps + 1 screen change.
- **SC-002**: After a successful one-tap log, the member sees
  on-screen confirmation (toast + updated balance sentence)
  within 500 ms of the server response landing — no full page
  navigation occurs.
- **SC-003**: A member whose last beer is archived or out of
  stock NEVER lands in a "tap a button that doesn't work" state:
  the UI either falls back to the generic picker or visibly
  disables the button with an explanation, 100 % of the time.
- **SC-004**: The Czech home-page strings introduced by this spec
  contain zero instances of "dlužíš" or any nagging-tone variant.
  Verified by reading the `cs.json` patch in the same PR.
- **SC-005**: The home-page render path issues ≤ 1 additional SQL
  query compared to the current page (the last-beer lookup folds
  into the existing query, or replaces it).
- **SC-006**: A panel re-run with the same four personas (or
  equivalent) confirms that the new home screen reads as "easy to
  use, obvious what to do" — qualitative measure; the
  pre-condition for closing this spec is a yes from at least
  three of the four personas.

## Assumptions

- The existing `logBeer` server action
  (`app/[locale]/(app)/log/actions.ts`) is reused unchanged. The
  one-tap button is a new UI shortcut, not a new action.
- The existing void/undo path (`voidConsumption`) continues to
  apply to consumptions created via the one-tap button — there is
  no new "one-tap log" data type.
- The bottom navigation bar's "Log" tab is kept (still useful for
  members who want to browse the full catalog before picking).
  Removing it is out of scope.
- The home page stays a Next.js server component for the initial
  render; the one-tap button is a small client island that calls
  the server action and triggers a router refresh + toast.
- Toast UI uses the existing `sonner` primitive already in the
  shadcn set.
- The bet-from-lost-match home module (concern #3 in the user's
  list) is **spec 018**, not this spec. The two specs can ship
  independently — this spec produces a home that is a strict UX
  improvement on the current one even without spec 018.
- Role-aware home modules (treasurer pending count, admin nudges)
  are **spec 019**. Again independent.
- The panel-discussion record from 2026-05-26 (in the conversation
  transcript that produced this spec) is the source of the
  persona-validated requirements above. Future panel re-runs are
  the proposed acceptance signal for SC-006.
