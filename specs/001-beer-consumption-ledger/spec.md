# Feature Specification: Beer Consumption Ledger (v1 MVP)

**Feature Branch**: `001-beer-consumption-ledger`

**Created**: 2026-05-19

**Status**: Draft (clarifications resolved 2026-05-19)

**Input**: User description: "beeromat v1 MVP — a mobile-first PWA for a small tennis club (about 20 members) to track per-session beer consumption, inter-member bet transfers (loser pays for winner's beer), stock levels per beer type with low-stock alerts, and balances owed to the club treasurer. Invitation-only auth via email magic link plus device-scoped 4-digit PIN (no passwords). Roles: member, stock_manager, treasurer, club_admin. Schema is multi-tenant (every row carries club_id) but v1 ships single-club UX only — one club seeded at deploy, no club switcher, no public onboarding. Currency is per-club configuration (CZK default). The treasurer marks payments as received; the app never processes money. After-match drink sessions group consumption so balances can be reviewed per session and across sessions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Log a beer and see my running tab (Priority: P1)

After a tennis match, a member walks into the clubhouse, pours a beer, opens beeromat on their phone, unlocks with their PIN, picks the beer they just drank from a short list, and taps "Log." Their personal tab for the current drink session updates immediately, showing what they've consumed and what they owe so far.

**Why this priority**: This is the single most painful problem the app exists to solve — "who drank how many beers tonight?" Every other feature builds on the integrity of this log. Members will use this flow multiple times per session; if it takes more than a few seconds, the whole product fails.

**Independent Test**: With one pre-seeded member logged in and one beer type configured, a member can open the app, log three beers across a few minutes, and see their tab reflect three entries with correct line totals and a running session total. No other feature (bets, stock alerts, treasurer view) is required for this story to deliver value.

**Acceptance Scenarios**:

1. **Given** a signed-in member on a device with a valid PIN, **When** they open the app and enter their PIN, **Then** they see the current open drink session with a one-tap "Log a beer" entry point.
2. **Given** the member is on the log screen with at least one beer type available in stock, **When** they tap a beer type and confirm, **Then** a new consumption is recorded against them in the current session and their running tab updates without a page reload.
3. **Given** the member has logged any consumptions in the current session, **When** they view their tab, **Then** they see a list of their consumptions for that session with timestamp, beer type, and unit price, plus a session total in the club's configured currency.
4. **Given** the member realises they logged the wrong beer within a short undo window, **When** they tap "undo" on that entry, **Then** the consumption is voided (visible as voided in history, not silently deleted) and their session total decreases accordingly.

---

### User Story 2 — Settle my tab in one tap (member self-pays) (Priority: P1)

A member's tab from one or more sessions has accumulated. They open beeromat, tap "Pay my tab," and the app shows their full outstanding balance. They confirm, and beeromat presents a Czech QR Platba code embedding the club's IBAN, the exact balance amount, and a unique payment reference — plus, if the club has configured it, a one-tap Revolut payment link. The member scans the QR with their banking app (or taps the Revolut link), completes the transfer in one tap, returns to beeromat, and confirms "I paid." Their balance shows as "pending confirmation" until the treasurer marks the payment as received.

**Why this priority**: This is the second of the two original pain points ("we forget to pay, or we send the wrong amount"). Czech bank apps universally support QR Platba scanning; Revolut is heavily used in the club. By presenting an exact-amount QR generated from a verified balance, beeromat eliminates both forgetting and miscounting in one motion. P1 because without it the daily-log loop accumulates into an unreconciled mess.

**Independent Test**: A member with a known outstanding balance can open the app, tap "Pay my tab," see a QR code containing the club's IBAN and the exact balance, scan it with their bank app, complete the transfer, return to beeromat, mark "I paid," and see their balance show as "pending confirmation."

**Acceptance Scenarios**:

1. **Given** a signed-in member with a positive outstanding balance and the club has a configured bank account, **When** they tap "Pay my tab," **Then** the app displays their full outstanding balance and offers payment instructions: a scannable QR Platba code (Czech standard SPAYD/SPD) embedding the club IBAN, the exact balance amount in the club's currency, and a unique payment reference (variable symbol). If the club has configured a Revolut handle, a "Pay with Revolut" link is also shown.
2. **Given** the member has completed the transfer in their banking app, **When** they tap "I paid" in beeromat, **Then** a Payment row is created with status `claimed`, the member's balance shows as "pending confirmation" with the amount visibly subtracted, and the treasurer sees a new pending item to confirm.
3. **Given** the member has no outstanding balance, **When** they open the settle screen, **Then** they see a clear "all paid up" message and no QR is displayed.
4. **Given** the club has NOT configured a bank account, **When** the member taps "Pay my tab," **Then** they see a message explaining that self-pay is unavailable until the club admin configures banking details, and they are directed to contact the treasurer.
5. **Given** the member has paid out-of-band (e.g., handed cash) without using the QR flow, **When** they later open the settle screen, **Then** they see a "Mark as paid (other method)" option that creates a `claimed` Payment with a note describing the method.

---

### User Story 3 — Treasurer confirms received payments (Priority: P1)

The treasurer reviews their bank account once a week (or on demand), sees incoming transfers, opens beeromat, and finds a list of "claimed" payments awaiting confirmation. For each, they tap "Confirm received" — that payment's status flips to `confirmed`, the member's balance is finalised, and the audit trail records who confirmed and when. If a claim doesn't match what arrived in the bank, the treasurer can dispute it (which restores the member's balance to its pre-claim state and surfaces the discrepancy).

**Why this priority**: This pairs with US 2 to close the payment loop. Without confirmation, "claimed" payments accumulate forever and members lose trust that the app reflects reality. P1.

**Independent Test**: With one member's `claimed` payment in the system, the treasurer can sign in, see it in their pending list, confirm it, and observe the member's balance update from "pending confirmation" to "settled."

**Acceptance Scenarios**:

1. **Given** the signed-in user has the treasurer role and one or more `claimed` payments exist, **When** they open the treasurer pending-confirmations view, **Then** they see a list with member name, claimed amount, reference (variable symbol), and the time the member marked it paid.
2. **Given** the treasurer is viewing a claimed payment, **When** they tap "Confirm received," **Then** that payment's status changes to `confirmed`, the member's balance finalises (no longer "pending"), and the action is recorded with treasurer identity and timestamp.
3. **Given** the treasurer is viewing a claimed payment that doesn't match the bank record, **When** they tap "Dispute" and provide a reason, **Then** the payment status changes to `disputed`, the member's balance is restored to its pre-claim state, the dispute reason is recorded, and the member is notified in-app on next visit.
4. **Given** a confirmed payment is found to be incorrect later, **When** the treasurer voids it, **Then** a compensating event is appended (preserving the original), the member's balance is restored by the voided amount, and the original payment and the void remain visible in history.

---

### User Story 4 — Treasurer records an out-of-band payment (escalation) (Priority: P2)

A member who hasn't been using the app paid the treasurer in cash at the clubhouse, or transferred money without claiming it in beeromat. The treasurer needs to record this against the member's balance. They open the member's profile, tap "Record payment manually," enter the amount and an optional note, and confirm. The payment is recorded as `confirmed` directly (skipping the `claimed` intermediate state), and the member's balance updates immediately.

**Why this priority**: This is the escalation path for cases where the member-initiated flow (US 2) wasn't used. P2 because most payments will flow through US 2; this is for stragglers and edge cases (large debts, cash payments, members without smartphones).

**Independent Test**: The treasurer can pick any member, record a payment with an arbitrary amount and a note, and immediately see that member's balance decrease by that amount.

**Acceptance Scenarios**:

1. **Given** the signed-in user has the treasurer role and is viewing a specific member, **When** they tap "Record payment manually," enter an amount and optional note, and confirm, **Then** a Payment row is created with status `confirmed`, marked as treasurer-initiated, with treasurer identity and timestamp; the member's balance decreases immediately.
2. **Given** a treasurer-initiated payment was recorded in error, **When** the treasurer voids it, **Then** a compensating event restores the member's balance and the original Payment + void remain in history.

---

### User Story 5 — Invite and onboard a new member (Priority: P1)

A club admin or treasurer enters a new member's email, picks their role, and sends an invitation. The invitee receives an email with a magic link, opens it on their phone, enters their display name, sets a 4-digit PIN for that device, and lands on the home screen ready to log their first beer.

**Why this priority**: Without invitation and onboarding, only the seed admin can use the app. The constitution mandates invitation-only access, so this flow is foundational; deferring it to v1.1 would mean v1 has only one user. P1.

**Independent Test**: An admin can issue an invitation to a fresh email address, the recipient can complete the magic-link + PIN-setup flow on a phone, and the new member can then log a beer (story 1) — all without the admin doing any manual configuration in between.

**Acceptance Scenarios**:

1. **Given** the signed-in user has admin or treasurer role, **When** they submit a new invitation with email + role, **Then** an invitation is created and an email containing a single-use magic link is dispatched.
2. **Given** an invitee receives the magic link, **When** they open it within the validity window, **Then** they reach a welcome screen prompting them to set their display name and a 4-digit PIN for this device.
3. **Given** the invitee submits a valid display name and PIN, **When** they confirm, **Then** they are signed in, a member record is created (active, with the assigned role), the invitation is marked accepted, and they land on the same home screen returning members see.
4. **Given** a magic link has expired or already been used, **When** the invitee opens it, **Then** they see a clear message and a way to request a new invitation from the admin/treasurer (not a way to self-request).

---

### User Story 6 — Resolve a bet by transferring beers between members (Priority: P2)

Two members bet a game for a beer; the winner drinks one (or more) beers that the loser owes. The loser opens the app, taps "Bet transfer," picks one of the winner's consumptions from the current open session, assigns it to themselves, and confirms. Both members' tabs update: the winner's tab is credited the beer, the loser's tab is charged for it. The original consumption row remains untouched; a separate transfer event records the move.

**Why this priority**: A frequent and confusing source of "we forgot what we owed" errors. Materially improves end-of-night reconciliation accuracy. P2 because the daily app is still useful without it, but the value-add is large.

**Independent Test**: Two members each have one consumption in the current session. One member initiates a transfer of the other's consumption onto themselves. Both balances update accordingly. The original consumptions are unchanged; a new transfer event is visible in both members' history with from/to identities.

**Acceptance Scenarios**:

1. **Given** two members A and B with at least one consumption each in the current open session, **When** A initiates a transfer of one of B's consumptions onto themselves, **Then** a transfer event is recorded (source consumption, from B, to A, by A, timestamp); B's balance decreases by that consumption's amount; A's balance increases by the same amount.
2. **Given** a transfer event exists, **When** any of the two parties view their history, **Then** they see the transfer with a clear visual indicator of which direction it went and a link to the original consumption.
3. **Given** a member attempts to transfer a consumption that belongs to a past (closed) session, **When** they search the pick list, **Then** that consumption is not available — only consumptions from the currently open session can be transferred.
4. **Given** a member attempts to transfer one of their own consumptions to themselves, **When** they submit, **Then** the action is rejected with a clear message — self-transfers are not allowed.
5. **Given** a member attempts to transfer a consumption that has already been transferred, **When** they submit, **Then** the action is rejected — each consumption can be transferred at most once (subsequent corrections happen by voiding the existing transfer).

---

### User Story 7 — Stock management and low-stock alerts (Priority: P2)

The stock manager records a delivery ("two cases of Pilsner Urquell arrived"), and stock for that beer type increases. As members log consumption, the stock for each beer type decreases. When a beer type drops to or below its low-stock threshold, a visible warning appears on the log screen so members know it's running out — and the stock manager gets a chance to reorder before it's gone.

**Why this priority**: Prevents the third pain point ("people get angry when the beer they like is out of stock"). P2 because the consumption-logging flow can function without it; missing stock just means surprises rather than data loss.

**Independent Test**: A stock manager records an initial stock level for one beer type with a threshold. Members log consumptions until stock crosses the threshold. The low-stock indicator appears for that beer type on the log screen for all members. The stock manager records a restock; the indicator clears.

**Acceptance Scenarios**:

1. **Given** the signed-in user has stock_manager (or admin) role, **When** they record a restock for a beer type with a positive quantity and optional reason, **Then** the beer type's stock increases by that quantity and a stock-change event is recorded (actor, quantity, reason, timestamp).
2. **Given** a beer type with stock at the low-stock threshold or below, **When** any member opens the log screen, **Then** that beer type is visually flagged as low-stock (without being hidden or unloggable).
3. **Given** a beer type with stock at zero, **When** a member attempts to log a consumption of it, **Then** the action is blocked with a clear message; stock cannot go negative.
4. **Given** an incorrect stock entry, **When** a stock manager records a corrective adjustment (positive or negative quantity, with reason), **Then** stock updates and a stock-change event captures the adjustment for audit.

---

### User Story 8 — Review my history across sessions (Priority: P3)

A member wants to check what they consumed last Tuesday, or see their total spending for the month. They open their profile, browse past sessions, and drill into any session to see line-by-line entries, transfers in/out, and the running balance at that point in time.

**Why this priority**: Trust-building and dispute resolution. P3 because day-to-day use does not require it — members can solve "what's my balance now?" through the current-session view and the standing balance.

**Independent Test**: A member with consumptions across two distinct sessions can view a history list showing both sessions with date, total, and current settled status, then drill into either session to see line items including any transfers.

**Acceptance Scenarios**:

1. **Given** a member with consumptions in multiple past sessions, **When** they open their history view, **Then** they see a chronological list of sessions in which they participated, each showing date, their session total, and whether their share is paid.
2. **Given** the member taps into a past session, **When** the detail screen loads, **Then** they see every consumption attributable to them in that session (including beers transferred onto them via bets), with timestamp, beer type, and price at the time.
3. **Given** a transfer event happened in that session, **When** the member views the detail, **Then** transfers are clearly visible alongside original consumptions and labelled with from/to identities.

---

### Edge Cases

- **No open session at log time** — when a member taps "Log a beer" and no session is open, a session is auto-opened with the current local date as its default label; the consumption attaches to it.
- **Session left open indefinitely** — sessions do not auto-close; if a session is still open at the start of a new evening, an admin or treasurer is prompted (non-blocking) to close the old one before opening a new one.
- **Magic link reused or expired** — clicking an already-used or expired link shows a clear error and instructs the user to request a new invitation from an admin/treasurer (not a self-service "resend").
- **Five wrong PIN attempts on a device** — the device's session is locked; subsequent unlock attempts are refused until a fresh magic link is used to re-authenticate.
- **Member is deactivated while having an outstanding balance** — deactivation prevents future log/bet activity but preserves the balance and history; the treasurer can still confirm or record payments against a deactivated member until balance is zero.
- **Member overpays via QR/Revolut** — if the actual transfer exceeds the claimed amount, the balance can go negative (a credit toward future consumption); this is acceptable and visible.
- **Member underpays via QR/Revolut** — if the actual transfer is less than the claimed amount, the treasurer disputes the claim; the member's balance is restored and they can re-initiate a settle for the correct (remaining) amount.
- **Member marks "I paid" but never actually transferred** — appears in the treasurer's pending list; treasurer disputes, balance restored, dispute reason visible to member.
- **Two simultaneous claims against the same balance** — only one `claimed` Payment can exist per member at a time; attempting to initiate a second pending settle while one is already pending shows a clear "you have a pending claim awaiting treasurer confirmation" message.
- **Club has no banking config** — member self-pay (US 2) is disabled; the "Pay my tab" button is replaced with "Contact treasurer to settle." Treasurer can still record payments manually (US 4).
- **Voiding a payment after subsequent payments** — voids are append-only; a voided payment restores the balance, and later events stack correctly because balance is always re-derived from the event sequence.
- **Two members attempt to transfer the same consumption simultaneously** — the first to commit wins; the second receives a clear "already transferred" error.
- **Bet transfer attempted across sessions** — only the current open session is in scope; consumptions from past sessions are not in the pick list.
- **Stock crosses threshold mid-session** — the low-stock indicator becomes visible on next screen refresh; no broadcast notification is required for v1.
- **Beer type renamed** — historical consumptions retain the price snapshot but display the current beer-type name (no historical name rendering).
- **Multiple devices for the same member** — each device has its own PIN; a magic-link sign-in on a new device adds another device-session without affecting existing devices.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication, identity, and access**

- **FR-001**: Only email addresses that have an open or accepted invitation MUST be allowed to begin a sign-in flow. Unknown emails MUST receive the same "check your inbox" response (no enumeration), but no email MUST actually be dispatched for unknown addresses.
- **FR-002**: First-time sign-in on a device MUST require the user to receive and follow a single-use magic link sent to their invited email.
- **FR-003**: Immediately after first sign-in on a device, the user MUST set a 4-digit PIN scoped to that device.
- **FR-004**: Subsequent app launches on a device with a registered PIN MUST require only the PIN, not a fresh magic link, until lock-out conditions are met.
- **FR-005**: Five consecutive incorrect PIN attempts on a device MUST lock that device's session; the user MUST then sign in again via magic link to re-enable that device.
- **FR-006**: Magic-link send requests MUST be rate-limited per email and per source IP to make automated abuse uneconomic.
- **FR-007**: The email-entry form MUST be protected by a bot-mitigation challenge before a magic-link send is attempted.
- **FR-008**: PINs MUST be stored as one-way hashes; the system MUST never be able to retrieve a plaintext PIN.

**Roles and permissions**

- **FR-009**: Every member MUST have exactly one of the roles: `member`, `stock_manager`, `treasurer`, `club_admin`. `club_admin` implies all permissions of the other roles.
- **FR-010**: Members MUST be able to log their own consumption, undo their own recent consumption within the undo window, view their own tab and history, initiate bet transfers, and initiate self-pay (US 2).
- **FR-011**: Stock managers MUST be able to do everything members can, plus record restocks, adjustments, beer-type updates, and void consumptions after the self-undo window has closed.
- **FR-012**: Treasurers MUST be able to do everything members can, plus view every member's balance, confirm or dispute claimed payments, record manual payments, void confirmed payments, end drink sessions, and void consumptions after the self-undo window has closed.
- **FR-013**: Club admins MUST be able to do everything other roles can, plus issue invitations, revoke invitations, change member roles, deactivate/reactivate members, and configure club settings (currency, locale default, low-stock thresholds at club level, club banking profile).

**Sessions and consumption**

- **FR-014**: A drink session MUST be a club-scoped container with a start timestamp, optional title, and an end timestamp (null while open).
- **FR-015**: There MUST be at most one open session per club at any time; logging a consumption while no session is open MUST auto-open one labelled with the current local date.
- **FR-016**: A consumption record MUST capture: the member, the beer type, a price snapshot at log time, the session, the timestamp, and the actor who logged it (almost always the same as the member; treasurers/admins MAY log on behalf of another member).
- **FR-017**: A consumption MAY be voided by its logger within a configurable undo window (default 5 minutes). After the window has closed, only **stock_managers, treasurers, and admins** MAY void it.
- **FR-018**: Voiding a consumption MUST be implemented by appending a void marker, not by deleting the original row. Both the original and the void MUST remain visible in history.
- **FR-019**: Ending a session MUST be a treasurer/admin action; ending a session MUST NOT delete its consumptions but MUST prevent further consumption logging into that session.

**Bet transfers**

- **FR-020**: A member MAY transfer the financial weight of one or more existing consumptions from the original drinker (the winner of the bet) to themselves (the loser), provided the source consumption belongs to the **currently open drink session** and has not already been transferred. Past-session consumptions are NOT in scope for bet transfers.
- **FR-021**: A bet transfer MUST be recorded as an append-only event referencing the source consumption, the originating member, the receiving member, the actor, and the timestamp.
- **FR-022**: A bet transfer's source member MUST NOT equal its target member (no self-transfers).
- **FR-023**: A bet transfer MAY be voided by the original logger or by a treasurer/admin; voiding MUST be a compensating event, not a hard delete.
- **FR-024**: After all transfers and voids are applied, a member's "effective consumption total" for a session MUST equal: sum of own consumptions, minus consumptions transferred away, plus consumptions transferred in. The system MUST surface this value, not the raw consumption sum, on tabs and balances.

**Stock**

- **FR-025**: Each beer type MUST have: name, current stock level (non-negative integer), low-stock threshold (non-negative integer), unit price (in the club's currency).
- **FR-026**: Logging a consumption MUST decrement the corresponding beer type's stock by 1 atomically.
- **FR-027**: Logging a consumption against a beer type with zero stock MUST be refused with a clear message; stock MUST never go negative.
- **FR-028**: A stock manager (or admin) MUST be able to record a restock (positive quantity, optional reason) which increases the beer type's stock and records an event with actor + timestamp.
- **FR-029**: A stock manager (or admin) MUST be able to record a stock adjustment (positive or negative quantity, mandatory reason) for inventory corrections; this records an event with actor + timestamp.
- **FR-030**: When a beer type's stock is at or below its threshold, the log screen MUST display a low-stock indicator next to that beer type for every member.

**Payments and balances**

- **FR-031**: A member's outstanding balance MUST equal: (effective consumption total across all sessions, valued at each consumption's price snapshot) minus (sum of confirmed payments). All values MUST be in the club's currency. A payment in status `claimed` (awaiting treasurer confirmation) MUST visually reduce the displayed balance but MUST be distinguished as "pending confirmation."
- **FR-032 — Member self-pay (settle in full)**: A member with a positive outstanding balance MUST be able to initiate "Pay my tab" which generates payment instructions for the full balance amount:
  - **(a) A Czech QR Platba code** (SPAYD/SPD format) embedding the club's IBAN, the exact balance amount, the club's currency code, and a unique reference (variable symbol) identifying the payment intent.
  - **(b) Optionally, a Revolut.me URL** opening the club's Revolut payment page pre-filled with the balance amount, if the club has configured a Revolut handle.
  - The system MUST NOT offer partial-amount self-pay in v1; the only member-initiated amount is the full current balance. Partial / atypical payments route through the treasurer (FR-035).
- **FR-033 — Member confirms transfer made**: After completing the transfer in their banking app (or paying by another out-of-band method), the member MUST be able to mark the payment as "I paid" within beeromat. This MUST create a Payment row with status `claimed`, capturing the claimed amount, the originating reference, the member's identity, the timestamp, and an optional free-text note (used for "paid in cash" or "Revolut direct" etc.).
- **FR-034 — Treasurer confirmation**: A treasurer MUST be able to view a list of `claimed` payments awaiting confirmation. For each, they MUST be able to:
  - (a) **Confirm received** — transitions the payment to status `confirmed`, finalising the balance reduction. Captures treasurer identity + timestamp. **This MUST be a single-tap action with no additional form input**: identity is taken from the session, timestamp from the server clock.
  - (b) **Dispute** — transitions the payment to status `disputed` with a captured reason; restores the member's pre-claim balance; the original `claimed` row + dispute marker remain in history; the member MUST be notified in-app at next visit.
  - (c) **Bulk confirm** — the treasurer MUST be able to select multiple `claimed` payments and confirm them in a single action; bulk confirmation MUST require no more than N+1 taps total (one tap to select each, one to confirm-all). The list MUST default-sort by claim time descending so the most recent claims are visible first; the treasurer MUST be able to filter by date range, member, and amount to ease matching against a bank statement.
- **FR-035 — Treasurer manual payment (escalation)**: A treasurer MUST be able to record a payment directly against a member without a corresponding `claimed` row, with: amount, optional note, timestamp, treasurer identity. The resulting Payment row MUST be created with status `confirmed` directly and MUST be flagged as treasurer-initiated for audit purposes. This path supports cash payments, members without smartphones, large outstanding debts requiring direct collection, and other out-of-band scenarios.
- **FR-036 — Voiding payments**: A treasurer MUST be able to void any `confirmed` payment (whether member-claimed or treasurer-initiated). Voiding MUST be implemented as a compensating event (void marker), not a hard delete; balance is restored by the voided amount; both the original Payment and the void MUST remain visible in history.
- **FR-037 — No money handling**: The application MUST NOT initiate, process, capture, or hold any actual money. Generating a payment instruction (QR Platba code, Revolut URL) is NOT considered "processing money" — the actual transfer is executed by the member's banking app. "Mark as paid" and "Confirm received" are purely recorded confirmations that money moved out-of-band.
- **FR-038 — Club banking profile**: The club MUST have an optional banking configuration set by `club_admin`: IBAN, account-holder display name, optional Revolut handle/URL, optional default QR message. If the IBAN is not configured, member self-pay (FR-032) MUST be disabled and the UI MUST clearly direct members to contact the treasurer; the treasurer's manual-payment path (FR-035) MUST remain available.

**Multi-tenancy and configuration**

- **FR-039**: Every domain entity MUST be scoped to a single club; no query path MAY return rows belonging to multiple clubs.
- **FR-040**: v1 MUST ship with exactly one club seeded at deploy time; the user-facing application MUST NOT include club creation, switching, or onboarding flows.
- **FR-041**: Currency MUST be a per-club configuration value (ISO 4217 code) defaulting to `CZK`; all displayed monetary amounts MUST be formatted in the club's currency using the user's locale conventions.
- **FR-042**: A user's preferred locale MUST default to the club's configured default and MUST be changeable per-user; v1 MUST ship Czech (cs-CZ) and English (en) language catalogs.
- **FR-043 — Admin-administered configuration**: All club-scoped configuration — including currency, locale default, banking profile (IBAN, account holder, Revolut handle), low-stock thresholds, beer types and prices, member records and roles, and any future per-club settings — MUST be administered via the in-app admin UI by users with the `club_admin` role. The application MUST NOT require a redeploy, server restart, or environment-variable change to modify any club setting. Environment variables MUST be reserved for deployment-scoped concerns (database URLs, third-party API keys, secrets) and MUST NOT carry tenant-scoped settings.

**Audit history**

- **FR-044**: Consumption, bet-transfer, payment (in any status), and stock-change rows MUST NOT be hard-deleted by any user action; corrections happen by appending void markers, dispute markers, or compensating events.
- **FR-045**: Every consumption, bet-transfer, payment-state transition, and stock-change MUST record the acting user's identity and the timestamp of the action.

**PWA**

- **FR-046**: The application MUST be installable to the home screen on iOS Safari and Android Chrome via a Web App Manifest (icon, display mode, theme color).
- **FR-047**: The daily log flow (open → unlock → log a beer) MUST be operable with a single thumb and no precise tapping (touch targets at least 44x44 px).

### Key Entities

- **Club** — Tenant root. Holds the club's name, configured currency code (ISO 4217), configured default locale, the optional banking profile (IBAN, account-holder name, Revolut handle, default QR message), and club-level settings (e.g., default low-stock threshold for new beer types). Every other entity points back to a single Club.
- **Member** — A person belonging to a club. Carries their email (used for sign-in), display name, role, active flag, and the timestamp they accepted their invitation. Two Members with the same email cannot exist within the same club.
- **Invitation** — A pending or completed authorisation for a specific email to join a specific club with a specific role. Records who issued it, when, the magic-link token, the validity window, and its status (pending, accepted, expired, revoked).
- **Device Session** — A member's registered presence on a specific device. Carries the hashed PIN, failed-attempt counter, last unlock time, and an optional lock-until marker. Independent per device.
- **Beer Type** — A kind of beer offered by the club. Carries name, unit price in club currency, current stock level, low-stock threshold, and a soft-archive flag for retired beer types (history references remain valid).
- **Drink Session** — A club-scoped container that groups consumption events into a meaningful unit (typically "after Tuesday's match"). Carries start timestamp, optional title, optional end timestamp (null while open), and the actor who opened/closed it.
- **Consumption** — A single beer drunk by a member, attributed to a session. Carries member, beer type, price snapshot at log time, session, timestamp, and the actor who logged it. Append-only; corrections happen via void markers.
- **Bet Transfer** — An event that moves the financial weight of one consumption from one member (winner) to another (loser). Carries source consumption, from-member, to-member, actor, timestamp.
- **Stock Change** — A restock or adjustment to a beer type's stock level. Carries beer type, delta (positive or negative), type (restock or adjustment), optional reason, actor, timestamp.
- **Payment** — A recorded movement of money from a member toward the club's bank account, out of band. Carries: member, claimed amount in club currency, status (`claimed`, `confirmed`, `disputed`), unique reference (variable symbol) when generated from a self-pay flow, optional note, origin flag (`member_initiated` or `treasurer_initiated`), claiming member identity (for self-pay), confirming/disputing treasurer identity (when applicable), and timestamps for each state transition.
- **Void Marker** — A compensating event referencing a Consumption, Bet Transfer, or Payment that nullifies it for balance calculations while preserving history. Carries the target row, reason, actor, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning member can open the app, unlock with their PIN, and log a beer in **under 5 seconds** of wall-clock time from the moment they tap the app icon.
- **SC-002**: A new invitee can complete the full first-time flow (open magic-link email → set display name → set PIN → log their first beer) in **under 3 minutes**.
- **SC-003**: A member can settle their tab in full (open app → tap "Pay my tab" → scan QR in their bank app → return → mark "I paid") in **under 60 seconds** of wall-clock time, excluding bank-app processing time.
- **SC-004**: After 3 months of continuous use, the club records **zero balance disputes** that cannot be resolved by reviewing the in-app audit history alone (no off-app spreadsheets needed).
- **SC-005**: At least **95% of consumptions** in a typical session are logged **within 60 seconds** of being drunk (measured by self-report or by comparing log timestamps to session walk-through observation).
- **SC-006**: After a beer type drops to or below its low-stock threshold, the low-stock indicator MUST be visible on the next screen refresh in **under 5 seconds** in normal network conditions.
- **SC-007**: The treasurer can confirm or dispute every `claimed` payment from a typical session in **under 5 minutes** of total interaction time.
- **SC-007a**: Confirming a single claimed payment MUST require **exactly one tap** by the treasurer (no form, no dialog confirmation). Bulk-confirming N claims MUST require **no more than N+1 taps** total (selection + confirm-all).
- **SC-008**: Across **12 months** of operation, the system records **zero confirmed credential-compromise incidents** attributable to authentication design (excluding members losing phones or sharing PINs).
- **SC-009**: The application is installable to the home screen and launches in standalone mode (no browser chrome) on **iOS Safari 16+** and **Android Chrome 110+** without additional store distribution.
- **SC-010**: Operating cost for one club of approximately 20 active members remains **at zero monthly cost** on the chosen free-tier infrastructure.
- **SC-011**: After v1 has been in use for one month, at least **80% of active members** report (via a one-question in-app survey) that beeromat is "easier than the previous way we did this."

## Assumptions

- **Authentication**: Email is reliable enough to serve as the primary identity factor; members have access to an email account on the device where they will use the app at first sign-in. PINs are intended as convenience unlocks, not as financial-grade authentication.
- **Pricing model**: Beer prices change rarely and are not retroactive; each consumption snapshots the price in effect at log time, so future price changes do not alter past balances.
- **Stock decrement is consumption-driven**: Bet transfers move money, not stock — the beer was physically drunk by whoever drank it, and stock was already decremented at that consumption event.
- **Sessions are short-lived in practice**: A drink session typically spans a single evening (3–6 hours); the system does not enforce session length but assumes admins will close stale sessions.
- **The undo window suffices for self-correction**: A 5-minute undo window for the logger themselves is enough for the most common error class ("logged the wrong beer"); harder cases route through stock managers, treasurers, or admins (FR-017).
- **QR Platba is universally supported by Czech banks**: All major Czech banking apps (Česká spořitelna, ČSOB, Komerční banka, Raiffeisenbank, Air Bank, Fio, mBank, etc.) support QR Platba scanning. The QR encodes a SPAYD payload that any Czech bank app can parse.
- **No bank API integration in v1**: beeromat does NOT call any banking API. Payment confirmation is performed manually by the treasurer in the `claimed → confirmed` transition. Automatic confirmation via bank API or Revolut Business webhooks is a v1+ enhancement.
- **The variable symbol is a payment reference, not a security secret**: The variable symbol encoded in the QR identifies the payment intent so a future bank-API integration could auto-match incoming transfers; it MUST be unique per payment intent but does not need to be cryptographically unguessable.
- **Member deactivation preserves history**: Deactivated members no longer log activity but their past consumptions, transfers, and outstanding balances remain part of the club's ledger.
- **Currencies do not mix within a club**: A club has exactly one currency at a time; if a club ever switches currencies, conversion of historical balances is out of scope for v1 and would require an explicit migration.
- **Bot mitigation is a standard managed CAPTCHA-alternative**: The specific provider is a planning concern; the spec only requires that the email form is protected and that magic-link sends are rate-limited.
- **No offline mode in v1**: The PWA is installable (manifest) but does not provide offline write or sync; the clubhouse is assumed to have working wifi or cellular at log time. Offline write/sync is an explicit v1+ deferral.
