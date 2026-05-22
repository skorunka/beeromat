# Feature Specification: UX Backlog Completion (v1.3)

**Feature Branch**: `004-ux-backlog-completion`

**Created**: 2026-05-22

**Status**: Shipped — v1.3 delivered; all 23 tasks complete, seven gates verified (E2E run in three batches: 55 + 17 + 13 = 85/85).

**Input**: User description: "beeromat v1.3 — UX backlog completion. Close the remaining items (9–15) of the post-v1 UX review."

This feature closes out the post-v1 UX review
(`specs/001-beer-consumption-ledger/ux-review.md` §5). v1.1 shipped the eight
P0/P1 findings (items 1–8); v1.2 (forms hardening) incidentally resolved half
of finding F17. v1.3 finishes the list — review items **9–15**, the P2/P3
findings — so the review is fully discharged.

It is a **UX-hardening release**: it adds **no new domain entities** and
changes **no balance, payment, stock, or bet business logic** and **no
Server Action contract**. The v1 data model and the v1.2 forms standard
(constitution v1.6.0) remain the source of truth. The work is presentation:
one new read-only screen, and refinements to existing screens.

## Personas *(mandatory — constitution v1.4.0)*

Carried from the v1 UX review; this feature exists to serve the ones the
review found under-served.

- **P1 — Standa, 67 · Stock manager**: Basic Android phone, large fingers, mis-taps often, uses the app twice a month as if new. **Czech only.** The review's "occasional user" — items F9/F10/F16 cluster around him.
- **P2 — Jiří, 58 · Treasurer**: Old Android, 5.5" screen, reading glasses, one thumb. Reconciles on Sunday mornings; cares that money adds up. **Czech only.**
- **P3 — Tereza, 34 · Member**: iPhone, fast, logs a beer in the seconds it takes to pack her bag. Bilingual. Wants instant confirmation that an action landed.
- **P4 — Marek, 23 · Member**: Power user, settles bets constantly, wants a clear running tally of what he owes.
- **P5 — Pavel, 45 · Club admin**: Moderate tech comfort, rare admin visits. Set the club up.

## User Scenarios & Testing *(mandatory)*

Each user story is one coherent slice of the backlog, independently
shippable and testable. Stories are ordered by the review's priority.

### User Story 1 - A member can see their own payment history (Priority: P1)

Review finding **F20**. Today a member can see a payment is "waiting on the
treasurer" on the Settle screen, but once it is confirmed it vanishes from
their view — only the treasurer sees payment state. A member asking "did my
500 Kč actually land?" has nowhere to look. v1.3 adds a member-facing
**payment-history screen**: the member's own timeline of every payment they
have made and its current state — pending, confirmed, or disputed — with the
amount and date.

**Why this priority**: It is the one genuine *story gap* left in the review
(the panel debated making it P1). Without it the payment loop is, from the
member's side, write-only.

**Independent Test**: Sign in as a member who has past payments in mixed
states; open the payment-history screen; confirm every one of their payments
appears with its amount, date, and current state, and that confirmed payments
are visible (not just pending ones).

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **Jiří** — **Given** a member with one confirmed and one pending payment, **When** he opens his payment history, **Then** both appear, each showing its amount, date, and state (confirmed / pending).
2. **Tereza** — **Given** a member whose payment was disputed, **When** she opens her payment history, **Then** that payment shows the disputed state.
3. **Marek** — **Given** a member who has never made a payment, **When** he opens his payment history, **Then** a friendly empty state is shown, not a blank screen.
4. **Tereza** — **Given** the payment-history screen, **When** it is viewed in Czech and in English, **Then** all labels and the state names render in the active locale.
5. **Pavel** — **Given** a member, **When** they open the payment-history screen, **Then** they see only their *own* payments — never another member's.

---

### User Story 2 - Friendlier stock management for the occasional user (Priority: P2)

Review findings **F9 / F10**. The stock screen taxes Standa: each beer-type
row carries five controls with no visual hierarchy, and the stock-adjust form
asks for a *signed integer* ("Change — negative to reduce"). Standa does not
think in negative numbers. v1.3 makes **Restock the visually dominant action**
on each row, and replaces the signed-delta field with a **plain positive
quantity plus an explicit Add-stock / Remove-stock choice** — so the stock
manager never types, or reasons about, a negative number.

**Why this priority**: The review found the app is "tuned for Marek and taxes
Standa — the club has more Standas." High reach among the exact persona the
v1 spec under-served, but not blocking a launch.

**Independent Test**: As a stock manager, open the beer-type list — Restock is
the most prominent action on a row; open the adjust flow — it asks for a
positive quantity and an Add/Remove choice, never a signed number; removing
more than the current stock is rejected with an in-app message.

**Acceptance Scenarios**:

1. **Standa** — **Given** the beer-type list, **When** he looks at a row, **Then** Restock is visually the primary action, distinct from the secondary controls.
2. **Standa** — **Given** the stock-adjust flow, **When** he opens it, **Then** he is asked for a positive quantity and an Add-stock / Remove-stock choice — there is no signed-number field.
3. **Standa** — **Given** the adjust flow set to Remove, **When** he removes more than the current stock, **Then** an in-app message in the active locale rejects it and no change is recorded.
4. **Standa** — **Given** a valid Add or Remove, **When** he submits, **Then** the stock level changes by exactly that amount — the recorded result matches v1's signed-delta behaviour.

---

### User Story 3 - The home balance reflects a just-logged beer (Priority: P2)

Review finding **F2**. After logging a beer, the only confirmation is a toast
that auto-dismisses; the balance on the home screen does not visibly change
until the member navigates away and back. Tereza, who logs in seconds and
leaves, is left unsure it worked. v1.3 makes the **home-screen balance
visibly reflect the new consumption** (and an undo of it) without a manual
revisit.

**Why this priority**: Affects every member on every log — the product's most
frequent action — but it is a trust/feedback gap, not a broken capability.

**Independent Test**: Log a beer, return to the home screen, and confirm the
outstanding balance now includes it; undo the consumption and confirm the
balance drops back.

**Acceptance Scenarios**:

1. **Tereza** — **Given** a member on the home screen with a known balance, **When** she logs a beer and returns home, **Then** the displayed balance has increased by that beer's price.
2. **Tereza** — **Given** she has just logged a beer, **When** she undoes it within the undo window and returns home, **Then** the balance reflects the removal.

---

### User Story 4 - A member can sign out (Priority: P2)

Review finding **F15**. The app has a sign-out capability but no screen
surfaces it — there is no way for a member to sign out from within the app.
v1.3 adds a **reachable sign-out control**.

**Why this priority**: Low reach (rare action) but a real gap and cheap to
close — a shared-device or wrong-account situation currently has no exit.

**Independent Test**: While signed in, find and use the sign-out control;
confirm the session ends and the app returns to the signed-out entry point.

**Acceptance Scenarios**:

1. **Pavel** — **Given** a signed-in member, **When** he opens the account/More area, **Then** a sign-out control is present.
2. **Pavel** — **Given** the sign-out control, **When** he uses it, **Then** his session ends and he lands on the signed-out entry screen; revisiting a protected screen requires signing in again.

---

### User Story 5 - Clearer empty states and guidance (Priority: P3)

Review findings **F16** and **F19**. Two screens inform without guiding: the
**log screen with no beer types** is a bleak empty grid (whereas history and
balances have friendly empty copy), and the **payment-dispute banner** tells a
member their payment was flagged but offers no next step. v1.3 gives the log
screen a friendly, on-tone empty state, and gives the dispute banner an
**actionable next step** — a link guiding the member on what to do.

**Why this priority**: Polish — no capability is missing, the screens just
dead-end instead of guiding. P3.

**Independent Test**: Open the log screen for a club with no beer types — a
friendly empty state shows. View the dispute banner as a member with a
disputed payment — it offers a link to a next step, not just text.

**Acceptance Scenarios**:

1. **Standa** — **Given** a club with no beer types yet, **When** he opens the log screen, **Then** a friendly empty state in the active locale is shown, consistent in tone with the other screens' empty states.
2. **Tereza** — **Given** a member with a disputed payment, **When** the dispute banner is shown, **Then** it includes an actionable link guiding her to the next step, not only an explanation.

---

### User Story 6 - Money-input guidance and bet visibility polish (Priority: P3)

Review findings **F17 (remainder)** and **F7 / F12 / F13**. v1.2 already
replaced the generic rejection toast on money inputs with an in-app message;
what remains of F17 is up-front guidance — **helper text stating the accepted
amount format** so a member knows the rule before being corrected. And the
bet experience lacks a clear **running tally** of a member's transferred
drinks (F12), plus minor copy gaps around bet transfers and the variable
symbol (F7/F13).

**Why this priority**: Smallest-impact polish; copy and a tally, no new
capability. P3.

**Independent Test**: Open a money-amount input — helper text states the
accepted format. As a member with bet transfers in the open session, confirm
a running tally of those transfers is visible.

**Acceptance Scenarios**:

1. **Jiří** — **Given** a money-amount input (settle, manual payment, restock, beer-type price), **When** he focuses it, **Then** helper text states the accepted format in the active locale.
2. **Marek** — **Given** a member with bet transfers in the open session, **When** he views the bet screen, **Then** a running tally of his transferred drinks for that session is visible, not only folded into the home balance.

---

### Edge Cases

- **Payment history with many entries**: a member with a long payment history must still get a usable, ordered (most-recent-first) timeline; the underlying query is already paginated.
- **Home-balance refresh after an undo**: the refreshed balance must reflect a *voided* consumption, not only a new one.
- **Remove-stock to exactly zero vs. below zero**: removing the exact current stock is allowed (lands at 0); removing more is rejected — the existing non-negative guard is unchanged.
- **Sign-out on a PIN-protected device**: signing out must also clear the device session, so the next visit starts a clean sign-in (no stale PIN gate).
- **Dispute banner after the dispute is resolved**: the banner and its action link must not persist once the disputed payment is no longer disputed.
- **Empty bet tally**: a member with no bet transfers this session sees no tally clutter, not a "0 transfers" line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide a member-facing screen showing the signed-in member's own payment history — every payment they have made, with its amount, date, and current state (pending, confirmed, disputed).
- **FR-002**: The payment-history screen MUST show confirmed payments, not only pending ones (the post-confirmation visibility gap is the point of the screen).
- **FR-003**: A member MUST see only their own payments on that screen; it MUST NOT expose another member's payment data.
- **FR-004**: The payment-history screen MUST show a friendly, localized empty state when the member has no payments.
- **FR-005**: On each beer-type row, the Restock action MUST be visually dominant over the row's other controls.
- **FR-006**: The stock-adjust flow MUST collect a positive quantity plus an explicit Add-stock / Remove-stock choice; it MUST NOT present a signed-integer field to the user.
- **FR-007**: A Remove-stock that would drive stock below zero MUST be rejected with an in-app, localized message, and MUST record no change. Removing exactly the current stock (to zero) is allowed.
- **FR-008**: The recorded outcome of an Add/Remove stock adjustment MUST be identical to v1's signed-delta behaviour — this feature changes the input affordance, not the stock arithmetic or the audit trail.
- **FR-009**: After a member logs a beer (or undoes one), the home-screen outstanding balance MUST visibly reflect the change without the member having to navigate away and back.
- **FR-010**: The app MUST surface a sign-out control reachable by a signed-in member from within the app.
- **FR-011**: Using sign-out MUST end the member's session and the device session, and return them to the signed-out entry point; a protected screen visited afterwards MUST require signing in again.
- **FR-012**: The log screen, when the club has no beer types, MUST show a friendly empty state in the active locale, consistent in tone with the existing history/balances empty states.
- **FR-013**: The payment-dispute banner MUST include an actionable next step (a link to where the member can act), in addition to explaining the dispute.
- **FR-014**: The dispute banner and its action link MUST NOT be shown once the payment is no longer in the disputed state.
- **FR-015**: Money-amount inputs MUST show helper text stating the accepted amount format, in the active locale.
- **FR-016**: The bet screen MUST show a member a running tally of their bet transfers for the open session, distinct from the home-screen balance figure.
- **FR-017**: Every user-facing string added or changed by this feature MUST flow through the `next-intl` catalog (`cs` default, `en`), follow the established mate-to-mate tone, and keep the `cs`/`en` catalogs in parity.
- **FR-018**: This feature MUST NOT add a domain entity, change a balance/payment/stock/bet calculation, or change a Server Action contract. It is confined to presentation.
- **FR-019**: Any form or input added or changed MUST comply with the constitution v1.6.0 "User Input & Forms" standard (in-app locale-aware validation, no native validation / `required` / `pattern`, no native date/time input) — so the `forms:check` gate stays green.
- **FR-020**: All interactive controls added or resized MUST meet the ≥44 px touch-target minimum established in v1.1.

### Review Items Covered

| Review item (§5) | Finding | User Story |
|------------------|---------|------------|
| 9 (P2) | F20 — no member payment history | US1 |
| 10 (P2) | F9 / F10 — dense stock UI, signed-int input | US2 |
| 11 (P2) | F2 — silent home balance | US3 |
| 12 (P2) | F15 — no sign-out | US4 |
| 13 (P3) | F16 — uneven empty states | US5 |
| 14 (P3) | F17 (remainder) / F19 — input guidance, inert banner | US5 (F19) + US6 (F17) |
| 15 (P3) | F7 / F12 / F13 — bet & variable-symbol polish | US6 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can find the current state of any payment they have made — pending, confirmed, or disputed — without help from the treasurer.
- **SC-002**: 100% of a member's own payments appear on their payment-history screen; 0% of any other member's payments do.
- **SC-003**: A stock manager can record a stock removal without ever entering or interpreting a negative number.
- **SC-004**: After logging a beer, a member sees the updated balance on the home screen within one screen-transition, with no manual refresh.
- **SC-005**: A signed-in member can sign out in at most two taps from a primary screen.
- **SC-006**: No screen added or touched by this feature presents a blank or dead-end state — every empty or error state offers either friendly context or a next step.
- **SC-007**: All seven verification gates pass, including `i18n:check` (catalog parity) and `forms:check`.
- **SC-008**: Every acceptance scenario above has a corresponding automated end-to-end assertion against the running app, and all pass.
- **SC-009**: The v1 UX review is fully discharged — all 15 items of §5 are shipped across v1.1, v1.2, and v1.3.

## Assumptions

- The `getPaymentHistory` query already exists (`specs/001-beer-consumption-ledger/contracts/payments.md`) and is callable by a member for their own data. v1.3 builds a screen over it and adds no new Server Action.
- The stock-adjust Server Action keeps its existing signed-delta contract; the Add/Remove UI computes the sign and the action behaviour is unchanged (FR-008/FR-018).
- The home-balance refresh is a data-freshness/revalidation concern, not a balance-calculation change — the balance figure itself is computed exactly as in v1.
- Sign-out reuses the existing sign-out capability surfaced nowhere in the UI today; v1.3 only adds the affordance and its placement.
- The persistent bottom navigation and Admin hub from v1.1 are the natural homes for the new screen and the sign-out control; exact placement is a planning decision.
- Personas are carried from the v1 UX review; no new persona research was performed for v1.3.
- The mate-to-mate copy tone and gender-neutral Czech established in v1.1/v1.2 apply to all new strings.
