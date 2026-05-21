# Feature Specification: UX Hardening (v1.1)

**Feature Branch**: `002-ux-hardening`

**Created**: 2026-05-21

**Status**: Draft

**Input**: User description: "beeromat v1.1 — UX hardening from the post-implementation review (`specs/001-beer-consumption-ledger/ux-review.md` §5). The eight P0/P1 findings, UX-only, no new domain entities."

This feature hardens the *existing* beeromat v1 product. v1 shipped all eight
user stories with passing verification gates, but a persona-driven review found
that a green pipeline had not produced a good experience for half its audience.
v1.1 fixes the eight highest-impact findings. It adds **no new domain entities**
and changes **no balances, payments, or stock logic** — it is purely about how
the existing capabilities are presented and reached.

## Personas *(mandatory — constitution v1.4.0)*

Carried over from the v1 UX review; this feature exists to serve the ones v1
under-served.

- **P1 — Jiří, 58 · Treasurer**: Android phone two generations old, 5.5" screen, reading glasses, one thumb (the other hand holds a glass). Reconciles payments Sunday mornings at the kitchen table. Resents anything that feels like "an app"; wants the money to add up. **Czech only.**
- **P2 — Tereza, 34 · Member**: iPhone, fluent with apps, logs a beer in the 20 seconds it takes to pack her bag after a weeknight match. Bilingual; will use either language but expects the app to default correctly.
- **P3 — Standa, 67 · Stock manager**: Basic Android phone, large fingers, mis-taps often, has never reliably remembered a PIN. Uses the app maybe twice a month, each time as if new. **Czech only.**
- **P4 — Marek, 23 · Member**: Power user, fast, logs rounds for the group and settles bets constantly. Finds every shortcut and every missing one.
- **P5 — Pavel, 45 · Club admin**: Moderate tech comfort. Touches admin screens rarely; when he does, must not need to remember last time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app speaks the member's language (Priority: P1)

Every screen renders fully in Czech or English according to the member's locale.
No English text leaks onto an otherwise-Czech screen.

**Why this priority**: v1's single largest gap (review finding F1, P0). Jiří and
Standa are functionally locked out of an English-only UI; the club is Czech.
Until this is fixed, the product cannot launch to its actual audience.

**Independent Test**: Set a member's locale to `cs`; visit every screen
(log, tab, settle, treasurer, bet, history, admin); confirm no literal English
appears. Repeat for `en`. Confirm the `cs` and `en` catalogs have identical keys.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **Jiří** — **Given** his locale is Czech, **When** he opens any screen, **Then** all labels, buttons, headings, toasts, and empty-state text are in Czech.
2. **Tereza** — **Given** her locale is English, **When** she opens any screen, **Then** all user-facing text is in English with no untranslated keys shown.
3. **(maintainer)** — **Given** the codebase, **When** the `i18n:check` gate runs, **Then** it fails if any user-facing string is hardcoded outside the catalog or if the `cs` and `en` key sets differ.

---

### User Story 2 - Every control is thumb-sized (Priority: P1)

All primary action controls are large enough to hit reliably with one thumb on
a small phone.

**Why this priority**: Review finding F5 (P0). Sub-44px buttons cause *wrong*
actions, not just slow ones — and the personas they fail (Jiří, Standa) are the
ones who can least afford a mis-tap.

**Independent Test**: At a 360×640 viewport, measure every primary action
button; each is at least 44×44 px. No two destructive/constructive actions are
closer than a clear, mis-tap-resistant gap.

**Acceptance Scenarios**:

1. **Standa** — **Given** the beer-types screen at phone size, **When** he aims for "Restock", **Then** the target is ≥44px tall and he does not hit a neighbouring control.
2. **Jiří** — **Given** the treasurer pending list, **When** he taps an action, **Then** every action button is ≥44px and comfortably spaced.

---

### User Story 3 - Confirm and Dispute cannot be confused (Priority: P1)

On the treasurer's pending-payments screen, each claim's amount and member name
read clearly, and the "Confirm received" and "Dispute" actions are visually
separated so one is never tapped for the other.

**Why this priority**: Review finding F4 (P0). A treasurer confirming a payment
he meant to dispute is a trust failure, not a styling nit.

**Independent Test**: At 360×640, a pending row shows amount + member name
prominently; Confirm and Dispute are on their own line with a clear gap; the row
does not wrap awkwardly.

**Acceptance Scenarios**:

1. **Jiří** — **Given** six pending claims on his old phone, **When** he scans the list, **Then** each row's amount and who-owes-it are immediately legible.
2. **Jiří** — **Given** one pending claim, **When** he goes to confirm it, **Then** "Dispute" is far enough from "Confirm received" that he cannot trigger it by accident.

---

### User Story 4 - Undo a mistaken confirmation (Priority: P2)

A treasurer who confirms a payment by mistake can reverse it from the screen,
with a reason, without help.

**Why this priority**: Review finding F6 (P1). The data layer already supports
voiding a confirmed payment; v1 simply never surfaced it, leaving a one-way
door. Reversibility is a UI property (constitution Principle V, v1.4.0).

**Independent Test**: Confirm a payment; from the treasurer view, reverse it
with a reason; the member's balance returns to its pre-confirmation state and
the reversal is recorded in the audit trail.

**Acceptance Scenarios**:

1. **Jiří** — **Given** he just confirmed the wrong claim, **When** he opens that payment and chooses "Undo confirmation" with a reason, **Then** the payment returns to a non-confirmed state and the member again owes that amount.
2. **Jiří** — **Given** a payment that is not confirmed, **When** he views it, **Then** no undo-confirmation action is offered (nothing to undo).

---

### User Story 5 - Recover from a forgotten PIN (Priority: P2)

A member who has forgotten their device PIN can request a fresh sign-in link
directly from the unlock screen, before exhausting their attempts.

**Why this priority**: Review finding F8 (P1). The occasional user (Standa) will
forget the PIN; today the only escape appears *after* five wrong attempts lock
the device.

**Independent Test**: On the PIN unlock screen, without entering a PIN, choose
"forgot PIN"; a magic-link email is sent; following it restores access and lets
the member set a new PIN.

**Acceptance Scenarios**:

1. **Standa** — **Given** the unlock screen and a forgotten PIN, **When** he chooses "Forgot PIN — email me a sign-in link", **Then** a sign-in link is sent and he is told to check his email — without burning any attempts.
2. **Standa** — **Given** he follows that link, **When** he returns to the app, **Then** he can set a new device PIN.

---

### User Story 6 - The bet screen always has a next step (Priority: P3)

When a member opens the bet-transfer screen and no session is open yet, the
screen explains how to start one instead of dead-ending.

**Why this priority**: Review finding F11 (P1, but small). Marek wants to settle
a bet before anyone has logged a beer; today he is told "no open session" with
nowhere to go — and a member cannot open a session directly.

**Independent Test**: With no open session, open the bet screen; it shows
guidance and a route to the log screen (logging the first beer opens the
session); after logging, the bet screen works normally.

**Acceptance Scenarios**:

1. **Marek** — **Given** no session is open, **When** he opens the bet screen, **Then** it tells him a session starts when the first beer is logged and offers a way to the log screen.
2. **Marek** — **Given** he then logs a beer, **When** he returns to the bet screen, **Then** the transferable-drinks list is available.

---

### User Story 7 - Get anywhere in one tap (Priority: P2)

Daily member destinations are reachable from a persistent navigation bar, and
the scattered admin screens are gathered under a single Admin hub.

**Why this priority**: Review findings F3 and F14 (P1). v1 routes every journey
through the home screen and back; admin screens are reachable only via a link
buried on the members page.

**Independent Test**: From any daily screen, a persistent nav reaches the other
daily screens without returning home. An Admin hub lists members, banking
profile, and beer-types in one place, reached in one tap by an admin.

**Acceptance Scenarios**:

1. **Tereza** — **Given** she is on the tab screen, **When** she wants to log a beer, **Then** a persistent nav takes her there without a trip through home.
2. **Pavel** — **Given** he needs the banking profile, **When** he opens the Admin hub, **Then** members, banking, and beer-types are all listed and one tap away.
3. **Standa** — **Given** the persistent nav, **When** he is a stock manager, **Then** it surfaces only destinations his role can use.

---

### User Story 8 - The app never looks frozen (Priority: P3)

Navigating between screens shows immediate loading feedback rather than a frozen
screen on slow devices or networks.

**Why this priority**: Review finding F18 (P1, but small). On Jiří's slow phone,
a tap with no feedback reads as a broken app.

**Independent Test**: Under throttled network, navigate between screens; each
shows a loading placeholder within a fraction of a second until content is ready.

**Acceptance Scenarios**:

1. **Jiří** — **Given** a slow connection, **When** he taps through to a screen, **Then** he sees a loading placeholder immediately, not a frozen previous screen.

---

### Edge Cases

- A member whose locale is unset inherits the club default (Czech); switching
  locale takes effect without losing their place.
- The `i18n:check` gate must distinguish user-facing strings from non-UI
  literals (log messages, test IDs, code) — it must not force-translate those.
- "Forgot PIN" must respect the same bot/rate-limit protections as normal
  magic-link sign-in; it must not become an unthrottled email trigger.
- Undo-confirmation must reject a payment that is not currently confirmed
  (already voided, disputed, or only claimed).
- The persistent nav must not cover content or the on-screen keyboard on small
  viewports.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every user-facing string on every screen (US1–US8 surfaces) MUST be served from the localization catalog; the UI MUST render fully in Czech and in English.
- **FR-002**: The system MUST provide an automated check that fails the build when a user-facing string is hardcoded outside the catalog, or when the Czech and English catalogs have differing key sets.
- **FR-003**: A member's language MUST follow their locale preference, defaulting to the club default when unset.
- **FR-004**: All primary action controls MUST present a touch target of at least 44×44 px at a 360×640 viewport.
- **FR-005**: Constructive and destructive actions on the same item MUST be visually separated enough to prevent accidental activation of one when aiming for the other.
- **FR-006**: The treasurer pending-payment row MUST present the amount and member name as the most prominent elements, with actions on a dedicated line.
- **FR-007**: A treasurer MUST be able to reverse a confirmed payment from the treasurer UI, supplying a reason; the reversal MUST restore the member's balance and be recorded in the audit history.
- **FR-008**: The undo-confirmation action MUST be offered only for payments currently in the confirmed state.
- **FR-009**: The device-PIN unlock screen MUST offer a "forgot PIN" action that sends a fresh sign-in link, available before the device is locked out.
- **FR-010**: The "forgot PIN" action MUST be subject to the same bot mitigation and rate limiting as the standard magic-link request.
- **FR-011**: When no drink session is open, the bet-transfer screen MUST explain that a session begins when the first beer is logged and provide a route to the log screen.
- **FR-012**: Daily member destinations MUST be reachable from a persistent navigation element without returning to the home screen.
- **FR-013**: The persistent navigation MUST show only destinations appropriate to the member's role.
- **FR-014**: Administrative destinations (members, banking profile, beer types) MUST be reachable from a single Admin hub.
- **FR-015**: Navigation between screens MUST display loading feedback while the destination is being prepared.
- **FR-016**: This feature MUST NOT introduce new domain entities or change balance, payment, stock, or bet-transfer calculations.

### Key Entities

No new entities. v1.1 changes presentation and navigation only; it reuses the
existing v1 data model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of screens render with zero untranslated/hardcoded strings in both Czech and English (verified by the catalog-coverage check).
- **SC-002**: The Czech and English catalogs have identical key sets at all times (build fails otherwise).
- **SC-003**: 100% of primary action controls measure ≥44×44 px at 360×640.
- **SC-004**: In a usability pass, a treasurer confirms the intended claim and never the wrong action across 10 consecutive pending-row interactions.
- **SC-005**: A treasurer can reverse a mistaken confirmation unaided in under 30 seconds.
- **SC-006**: A member who has forgotten their PIN regains access without ever hitting the five-attempt lock-out.
- **SC-007**: From any daily screen, any other daily screen is reachable in a single tap.
- **SC-008**: Every screen transition shows visible feedback within 300 ms of the tap.

## Assumptions

- The existing v1 data model, Server Actions, and balance/payment/stock logic
  are correct and unchanged; v1.1 only re-presents and re-routes them.
- The `voidConfirmedPayment` capability already exists in the action layer and
  needs surfacing, not building.
- Czech is the club's default locale; English is the only other catalog.
- "Primary action controls" means buttons that perform an action (log, confirm,
  dispute, transfer, save, restock); purely navigational links are covered by
  the persistent-nav and hub work rather than the 44px rule.
- The persistent navigation targets the daily member flows (home, log, tab,
  history, bet); operational screens (treasurer, stock, admin) are reached via
  role-appropriate entries and the Admin hub.
