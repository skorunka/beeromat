# Feature Specification: Visual Redesign & Design System (v1.4)

**Feature Branch**: `005-visual-redesign`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "beeromat v1.4 — visual redesign & design system. Give the app a real identity: the 'Clubhouse' theme — warm honey-amber, foam cream, roast brown."

The shipped beeromat product (v1–v1.3) is functionally complete and
UX-hardened, but it wears the unstyled shadcn/ui defaults — flat greys,
no palette, no typographic voice, **no identity**. v1.4 gives it one:
the **Clubhouse** look (proposal A, chosen from the `/design` preview) —
warm honey-amber, foam cream, and roast brown, the cosy
after-the-match tavern feel that matches the app's mate-to-mate copy
tone and its *beer + friends + tennis* character.

beeromat is a **mobile-first / mobile-only** app — every screen is a
phone screen; there is no desktop layout to design. v1.4 is a
**presentation-only** release: it adds **no domain entities**, changes
**no balance / payment / stock / bet logic**, and changes **no Server
Action contract**. The v1 data model and the v1.6.0 forms standard
remain the source of truth. The work is the look: a design-token
palette, a typographic scale, restyled components, reworked screen
layouts, and a branded welcome screen.

## Personas *(mandatory — constitution v1.4.0)*

Carried from the v1 UX review, re-framed for what each one needs from
the *look* of the app.

- **P1 — Standa, 67 · Stock manager**: Basic, small old Android, large fingers, reading glasses, uses the app twice a month. **Czech only.** A redesign that trades contrast or text size for style fails him first — he is the legibility bar the whole theme must clear.
- **P2 — Jiří, 58 · Treasurer**: Old Android, 5.5" screen, one thumb, reading glasses. Resents anything that "feels like an app". A warm, calm, uncluttered look earns his trust; a busy or trendy one loses it.
- **P3 — Tereza, 34 · Member**: iPhone, fluent. Notices and appreciates a considered look; a polished identity is what makes her happy to have the app on her phone.
- **P4 — Marek, 23 · Member**: Power user. Wants the redesign to stay *fast* — no decorative weight that slows the golden logging path.
- **P5 — Pavel, 45 · Club admin**: Sets the club up. Wants the admin screens to feel part of the same product, not an afterthought.

## User Scenarios & Testing *(mandatory)*

A visual redesign is cross-cutting, so the stories are sliced as
**layers** — each one a complete, shippable increment of the look,
each building on the one before. "Independently testable" here means:
the layer is observable (the theme is applied, a screen is restyled)
**and** every existing v1–v1.3 behaviour still passes its E2E spec —
the redesign changes how the app looks, never what it does.

### User Story 1 - A coherent visual identity (Priority: P1)

The whole app stops looking like an unstyled default and takes on the
Clubhouse identity: the warm palette and the display typeface are wired
through a single token source, so every screen — without exception —
renders in the Clubhouse look instead of flat grey and the system font.
The theme has a **light** and a **dark** variant; the app follows the
phone's OS colour-scheme preference.

**Why this priority**: This is the redesign's foundation and its
single biggest visible jump. After this layer the app already *has* an
identity; the later layers refine it. It is also the layer the
legibility constraint is won or lost on.

**Independent Test**: Open any screen — the background is the Clubhouse
cream, headings/primary actions use honey-amber and roast brown, body
text is the dark warm ink, and the display typeface is in use; no
screen still shows the old grey default. Every v1–v1.3 E2E spec still
passes.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **Tereza** — **Given** any signed-in screen, **When** it loads, **Then** its background, surfaces, primary actions, and text use the Clubhouse palette — no flat-grey default surface remains.
2. **Standa** — **Given** any screen, **When** body text and primary actions are measured, **Then** text-to-background contrast meets WCAG AA (≥4.5:1 for body text, ≥3:1 for large text and UI components).
3. **Jiří** — **Given** the app in Czech and in English, **When** any screen renders, **Then** the display typeface is applied and all copy remains fully legible at the default size on a 360×640 screen.
4. **Marek** — **Given** the golden logging path (home → log → tap a beer), **When** it is walked after the theme is applied, **Then** it still completes in under 10 seconds — the theme adds no perceptible weight.
5. **Pavel** — **Given** the full v1–v1.3 E2E suite, **When** it runs against the themed app, **Then** every behavioural test still passes — appearance changed, behaviour did not.
6. **Tereza** — **Given** her phone is set to dark mode, **When** she opens any screen, **Then** it renders in the dark Clubhouse theme (deep roast-brown ground, warm light text), still meeting WCAG AA contrast; switching the phone back to light re-themes the app cleanly.

---

### User Story 2 - Polished, consistent components (Priority: P2)

Every shared building block — buttons, inputs, cards, badges, dialogs,
the v1.2 form primitives, the persistent bottom nav, toasts, empty
states — is restyled into one coherent Clubhouse component set:
consistent corner radius, shadow, border, spacing, and state styling
(hover/pressed/disabled/focus), so the app feels designed, not
assembled.

**Why this priority**: US1 makes the *colours* right; US2 makes the
*components themselves* look intentional. High impact, but it builds on
US1's tokens.

**Independent Test**: Across the app, a given component type (e.g. a
primary button, a card, an input) looks and behaves identically
everywhere; focus and pressed states are visible; nothing carries a
leftover default style.

**Acceptance Scenarios**:

1. **Tereza** — **Given** primary buttons anywhere in the app, **When** they are compared, **Then** they share one consistent shape, fill, and text style.
2. **Standa** — **Given** any interactive control, **When** it is measured at 360×640, **Then** it meets the ≥44 px touch-target minimum, and its focused and pressed states are clearly visible.
3. **Jiří** — **Given** a form (e.g. the manual-payment form), **When** a field is invalid, **Then** the error styling is part of the Clubhouse system — consistent with every other form — and the v1.6.0 forms standard (in-app, no native validation) is intact.

---

### User Story 3 - Reworked member-facing screen layouts (Priority: P2)

The member-facing screens — home, log, tab, settle, bet, account,
history — have their spacing, visual hierarchy, and layout revisited so
the new look is used well: a clear focal point per screen, comfortable
rhythm, the primary action obvious.

**Why this priority**: The screens members touch daily; reworking their
layout is where the redesign pays off in everyday use. Builds on US1+US2.

**Independent Test**: Each member screen has one clear primary focus
and a comfortable layout at 360×640; the screen's existing actions and
content are all still present and reachable.

**Acceptance Scenarios**:

1. **Tereza** — **Given** the home screen, **When** it loads, **Then** the outstanding balance is the clear focal point and the primary action is immediately obvious.
2. **Marek** — **Given** the log screen, **When** it loads, **Then** the beer tiles are the dominant element and tapping one is the obvious gesture.
3. **Jiří** — **Given** any member screen at 360×640, **When** it renders, **Then** no content is clipped, overlapped, or pushed off-screen, and the bottom nav does not occlude content.

---

### User Story 4 - A welcome screen for the signed-out entry (Priority: P2)

The signed-out entry point gets a branded **welcome / landing hero**:
the beeromat identity, a warm one-line invitation in the Clubhouse
look, leading into the existing sign-in flow — instead of dropping
straight onto a bare form.

**Why this priority**: First impression. A new or returning member
currently meets an unstyled form; a welcome screen is where the
identity introduces itself. Independent of the in-app screens.

**Independent Test**: A signed-out visitor lands on a branded welcome
screen and can proceed from it into the existing sign-in flow.

**Acceptance Scenarios**:

1. **Tereza** — **Given** a signed-out visitor opens the app, **When** the entry screen loads, **Then** a branded welcome hero in the Clubhouse look is shown.
2. **Standa** — **Given** the welcome screen, **When** he acts on it, **Then** a single clear control leads into the existing magic-link sign-in flow — no extra steps, no new auth behaviour.
3. **Pavel** — **Given** the welcome screen copy, **When** it renders in Czech and English, **Then** every string is from the catalog and in the established mate-to-mate tone.

---

### User Story 5 - Reworked admin screen layouts (Priority: P3)

The admin surfaces — the Admin hub and the member-invite, banking,
beer-types, pending, and balances screens — are brought into the same
Clubhouse system: same components, same rhythm, so admin does not feel
like a different, older product.

**Why this priority**: Admin screens are touched rarely and by few
people (Pavel, Standa-as-stock-manager); important for coherence but
the lowest-traffic surface. P3.

**Independent Test**: Each admin screen uses the Clubhouse components
and layout conventions; nothing on an admin screen still shows the
pre-redesign default look.

**Acceptance Scenarios**:

1. **Pavel** — **Given** any admin screen, **When** it loads, **Then** it uses the Clubhouse palette, typography, and components — visually of a piece with the member screens.
2. **Standa** — **Given** the beer-types screen, **When** he uses it, **Then** its controls meet the same legibility and touch-target bar as the rest of the app.

---

### Edge Cases

- **Small old screen (360×640)**: every screen must hold up at the smallest supported size — no clipping, no horizontal scroll, no occlusion by the bottom nav.
- **Display typeface fails to load**: the app must fall back to a legible system typeface without layout breakage or invisible text.
- **Reduced motion**: any motion the redesign introduces must respect the OS "reduce motion" setting.
- **OS colour-scheme switch**: toggling the phone between light and dark must re-theme the app without a reload artifact or a flash of the wrong theme.
- **Long content / long names**: a long beer name, club name, or member name must not break a card or push the layout.
- **The redesign must not regress behaviour**: every v1–v1.3 flow keeps working; the redesign is appearance-only.
- **Reused-locale rendering**: both `cs` and `en` must look correct — longer Czech strings must not overflow restyled components.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST present a single, coherent visual identity — the "Clubhouse" theme — across every screen; no screen may retain the pre-redesign unstyled-default appearance.
- **FR-002**: All colour MUST derive from one shared set of design tokens (the Clubhouse palette: a cream background, a lighter surface, honey-amber primary, roast-brown accent, dark warm ink for body text, a warm grey for secondary text, and a border tone). A component MUST NOT hardcode an off-token colour.
- **FR-003**: The app MUST use a defined typographic scale with a characterful display typeface for headings and a legible body face; the type sizes MUST be generous enough to read on a 360×640 screen.
- **FR-004**: Body text MUST meet WCAG AA contrast (≥4.5:1) against its background; large text and interactive UI components MUST meet ≥3:1. This is a hard constraint — the warm palette may not be applied at the cost of contrast.
- **FR-005**: Every shared UI primitive — buttons, inputs, cards, badges, dialogs, the form primitives, the bottom nav, toasts, empty states — MUST be restyled into the Clubhouse system with consistent radius, elevation, border, spacing, and interactive-state styling.
- **FR-006**: Every interactive control MUST keep the ≥44 px minimum touch target at 360×640 (the v1.1 standard is retained) and MUST have a visible focus state.
- **FR-007**: The member-facing screens (home, log, tab, settle, bet, account, history) MUST have their layout, spacing, and hierarchy reworked so each has a clear primary focus, with all existing actions and content still present and reachable.
- **FR-008**: The admin screens (the Admin hub, member invite, banking, beer-types, pending, balances) MUST be restyled into the Clubhouse system, visually consistent with the member screens.
- **FR-009**: The signed-out entry MUST present a branded welcome/landing hero screen that leads into the existing magic-link sign-in flow without changing any authentication behaviour.
- **FR-010**: The redesign MUST NOT change any behaviour: no domain entity, no balance/payment/stock/bet calculation, and no Server Action contract may change. Every v1–v1.3 acceptance behaviour MUST still hold.
- **FR-011**: Every user-facing string added by the redesign (e.g. welcome-screen copy) MUST flow through the `next-intl` catalog in both `cs` and `en`, in the established mate-to-mate tone, keeping the catalogs in parity.
- **FR-012**: Any form or input restyled MUST remain compliant with the constitution v1.6.0 "User Input & Forms" standard (in-app locale-aware validation, no native validation / `required` / `pattern`, no native date/time input) — `forms:check` stays green.
- **FR-013**: The display typeface MUST have a legible fallback so a failure to load it never leaves text invisible or the layout broken.
- **FR-014**: Any motion or transition introduced MUST respect the operating system's reduced-motion preference.
- **FR-015**: Every screen MUST render correctly at 360×640 — the smallest supported size — with no clipping, horizontal scroll, or content occluded by the bottom navigation.
- **FR-016**: The app MUST provide a **dark Clubhouse theme** alongside the light one and MUST follow the device's OS colour-scheme preference — a phone set to dark renders the dark theme, light renders light; no in-app toggle is required. The dark theme MUST keep the Clubhouse character (a deep roast-brown ground, warm surfaces, honey-amber primary, warm light text) and MUST meet the same FR-004 contrast bar as the light theme. Switching the OS preference MUST re-theme the app cleanly, with no flash of the wrong theme on load.

### Key Design Tokens *(the chosen Clubhouse palette — proposal A)*

**Light theme:**

| Token role | Colour | Hex |
|------------|--------|-----|
| Page background | Foam Cream | `#F6EEDD` |
| Surface / cards | Pour White | `#FFFBF3` |
| Primary action | Honey Amber | `#B5701A` |
| Accent / headings | Roast Brown | `#4B3826` |
| Body text | Stout Ink | `#2C2114` |
| Secondary text | Malt Grey | `#8C7B62` |
| Border / divider | — | `#E4D7BE` |

**Dark theme:** a derived dark Clubhouse palette — a deep roast-brown
background, warm dark-brown surfaces, a honey-amber primary (brightened
as needed for contrast), and warm light cream text. Exact dark hex
values are finalized in planning so both themes clear the FR-004
contrast bar.

Display typeface: a characterful grotesque (e.g. Bricolage Grotesque),
loaded with a system fallback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the app's screens render in the Clubhouse palette and typeface; zero screens retain the pre-redesign unstyled-default look.
- **SC-002**: In **both** the light and the dark theme, 100% of body-text elements meet WCAG AA contrast (≥4.5:1) and 100% of large text and interactive components meet ≥3:1.
- **SC-002b**: The app renders the theme matching the device's OS colour-scheme preference, with no flash of the wrong theme on load.
- **SC-003**: 100% of interactive controls meet the ≥44 px touch-target minimum at 360×640.
- **SC-004**: Every screen renders with no clipping, horizontal scroll, or nav occlusion at 360×640.
- **SC-005**: The full v1–v1.3 Playwright E2E suite passes unchanged in behaviour against the redesigned app — behaviour is provably untouched.
- **SC-006**: The golden logging path (home → log → tap a beer) still completes in under 10 seconds.
- **SC-007**: All seven verification gates pass, including `i18n:check` (catalog parity) and `forms:check`.
- **SC-008**: Every acceptance scenario above has a corresponding automated assertion (a Playwright check of applied theme / contrast / touch target / layout / the welcome screen, or a green regression spec), and all pass.

## Assumptions

- The Clubhouse palette and the display-typeface choice are settled (proposal A from the `/design` preview); v1.4 implements them, it does not re-explore the visual direction.
- The redesign is presentation-only. The v1 data model and every Server Action contract (`specs/001-beer-consumption-ledger/`) and the v1.6.0 forms standard are unchanged.
- "Layout rework" means revisiting spacing, hierarchy, and arrangement within each existing screen — not adding screens (other than the welcome screen) or removing capabilities. The UX flows hardened in v1.1–v1.3 stay intact.
- The existing v1–v1.3 E2E specs are the behavioural safety net; where a redesign changes a selector or visible text, the spec is updated to match the new markup, never the behaviour.
- Personas are carried from the v1 UX review; no new persona research was performed for v1.4.
- The `/design` proposal page is a scratch artifact and is removed as part of v1.4.
