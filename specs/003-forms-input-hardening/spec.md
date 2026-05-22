# Feature Specification: Forms & Input Hardening (v1.2)

**Feature Branch**: `003-forms-input-hardening`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "beeromat v1.2 — forms & input hardening. Replace browser-default form validation and native date/time picker controls across the whole app with a consistent, accessible, locale-aware form layer, per constitution v1.5.0's forms standard."

This feature hardens *input handling* across the existing beeromat product. v1
and v1.1 shipped every user story with passing verification gates, but the
review behind constitution amendment v1.5.0 found the app's forms leaning on
the browser's own validation: the HTML `required` attribute and native
constraints surface the browser's default validation bubbles — unstyled,
inconsistent between browsers, and blind to the chosen language — while Zod
checked input only on the server. v1.2 routes every form through an in-app,
locale-aware validation layer so a Czech-only member on an old Android phone
sees the same plain-language, in-context feedback as a power user on an
iPhone.

It adds **no new domain entities**, changes **no balances, payments, or stock
logic**, and changes **no Server Action contract**. The v1 data model and
Server Actions in `specs/001-beer-consumption-ledger/` remain the source of
truth. This is purely about how input is collected, validated, and explained.

## Personas *(mandatory — constitution v1.4.0)*

Carried from the v1 UX review; re-stated for what each one needs from a *form*.

- **P1 — Standa, 67 · Stock manager**: Basic Android phone, large fingers, mis-taps often, uses the app twice a month as if new. **Czech only.** Mistypes constantly — so he is the person a form's error handling exists for. A browser validation bubble in English is, to him, a dead end.
- **P2 — Jiří, 58 · Treasurer**: Android phone two generations old, 5.5" screen, reading glasses, one thumb. Records cash payments and reconciles on Sunday mornings. Types amounts; must trust that what he entered is what the app understood, and must see *why* if it is rejected. **Czech only.**
- **P3 — Tereza, 34 · Member**: iPhone, fluent with apps, signs in and enters her PIN in seconds between match and bag-packing. Bilingual; expects the form to speak whichever language the app is in, not whichever language her browser shipped with.
- **P4 — Pavel, 45 · Club admin**: Moderate tech comfort. Fills the admin forms (member invite, banking details, beer types, stock) rarely; each time he must be told plainly what a field wants without remembering last time.
- **P5 — Marek, 23 · Member**: Power user, fast, often submits before reading. Tabs through fields, pastes values, double-taps submit. The form must catch his haste without losing what he typed.

## User Scenarios & Testing *(mandatory)*

A form is "hardened" when: (a) no browser-native validation bubble can appear;
(b) every validation message is rendered by the app, in the active locale, in
the established mate-to-mate tone, next to the field it concerns; (c) the rules
the client enforces are the *same* rules the Server Action enforces; and
(d) invalid input never costs the user the rest of what they typed.

The work is sliced by form group so each slice is independently shippable: a
group can be migrated, verified, and merged without the others.

### User Story 1 - Trustworthy auth & onboarding forms (Priority: P1)

The forms every member meets first and most often: the sign-in email form, PIN
setup, PIN unlock, and invitation acceptance (display name). When a member
enters something the form cannot accept — a malformed email, a 3-digit PIN, two
PINs that differ, an empty name — the app explains the problem in the member's
language, in plain words, directly beneath the field, and keeps everything else
they typed. No browser popup ever appears.

**Why this priority**: Every member hits these forms on every device on every
login; they are the app's first impression. A Czech-only member who meets an
English browser bubble here may never get past it. Standa mistyping his PIN is
the single most common form interaction in the product.

**Independent Test**: On each auth/onboarding form, submit invalid input and
confirm no native validation bubble appears and an in-app message shows in the
active locale beside the field; correct the input and confirm the message
clears and the form proceeds. Fully testable without touching any other form
group.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **Standa** — **Given** the app is in Czech and the PIN-setup screen is open, **When** he enters a 3-digit PIN and submits, **Then** an in-app Czech message explains the PIN must be 4 digits, no browser bubble appears, and the field he was on keeps focus.
2. **Standa** — **Given** PIN setup with a confirmation field, **When** the two PINs do not match, **Then** an in-app Czech message says so and neither entered value is cleared.
3. **Tereza** — **Given** the app is in English and the sign-in form is open, **When** she submits an address with no `@`, **Then** an in-app English message explains the email looks wrong and the email field state is preserved.
4. **Tereza** — **Given** a validation error is visible on the sign-in form, **When** she switches the app language, **Then** the visible error text re-renders in the newly chosen language.
5. **Marek** — **Given** the invitation-accept form, **When** he submits with the display-name field empty, **Then** an in-app message in the active locale asks for a name and the form is not submitted to the server.
6. **Marek** — **Given** any auth form with no input errors, **When** he double-taps submit, **Then** the action runs once and the submit control is disabled while it is in flight.

---

### User Story 2 - Trustworthy money forms (Priority: P2)

The forms where a member or the treasurer enters an amount: the "I paid another
way" form on the settle screen (amount + note) and the treasurer's manual
payment form (amount + note). Amounts and notes are validated in-app, in the
active locale, before the Server Action runs — a malformed amount, a negative
or zero amount, or a missing required note is explained in context.

**Why this priority**: Lower traffic than auth, but error-sensitive — these
forms move money figures. Jiří must trust that the amount he typed is the
amount the app understood, and see plainly why an entry was rejected. P2, not
P1, because fewer members reach these screens and less often.

**Independent Test**: On each money form, enter a malformed or out-of-range
amount and confirm an in-app localized error appears, no native bubble shows,
and the Server Action does not fire; enter a valid amount and confirm it
records. Testable without the auth or admin groups.

**Acceptance Scenarios**:

1. **Jiří** — **Given** the app is in Czech and the manual-payment form is open, **When** he enters a non-numeric amount, **Then** an in-app Czech message explains a valid amount is needed and the form is not submitted.
2. **Jiří** — **Given** the manual-payment form, **When** he submits with the note field empty and a note is required, **Then** an in-app Czech message asks for a short note and the amount he typed is preserved.
3. **Marek** — **Given** the settle "paid another way" form, **When** he enters a zero or negative amount, **Then** an in-app message in the active locale rejects it before the Server Action runs.
4. **Jiří** — **Given** a valid amount and note, **When** he submits, **Then** the payment records exactly as in v1 — no change to amounts, statuses, or confirmation behaviour.

---

### User Story 3 - Trustworthy admin forms (Priority: P3)

The forms behind the admin hub: member invite (email + role), banking profile
(IBAN, account holder, Revolut handle, QR message), and the beer-type forms
(add, edit, restock, stock adjust). Each validates in-app, in the active
locale, with messages beside the field.

**Why this priority**: Admin forms are touched rarely and by the fewest people
(Pavel, and Standa in his stock-manager role). They still must not be the one
corner of the app left on native browser validation — consistency is the point
of the feature — but they carry the least daily traffic. P3.

**Independent Test**: For each admin form, submit invalid input (malformed
email, malformed IBAN, duplicate beer name, non-integer stock quantity,
out-of-range adjustment) and confirm an in-app localized error appears with no
native bubble; submit valid input and confirm it proceeds as in v1.

**Acceptance Scenarios**:

1. **Pavel** — **Given** the app is in Czech and the member-invite form is open, **When** he enters a malformed email address, **Then** an in-app Czech message explains it and the chosen role selection is preserved.
2. **Pavel** — **Given** the banking-profile form, **When** he enters an IBAN that fails the format check, **Then** an in-app message in the active locale flags the IBAN field specifically and other fields keep their values.
3. **Standa** — **Given** the restock form, **When** he enters a quantity that is not a positive whole number, **Then** an in-app Czech message explains what the field expects.
4. **Standa** — **Given** the stock-adjust form, **When** he submits with the reason field empty, **Then** an in-app Czech message asks for a short reason before the Server Action runs.

---

### User Story 4 - A locale-aware standard for date entry (Priority: P3)

Constitution v1.5.0 bans native `<input type="date">` / `type="time">` /
`type="datetime-local">`: they render inconsistently across browsers and
ignore the application locale. An audit for this feature found **no screen in
the app currently collects a date or time** — so this story is preventative:
it adds a guardrail so a native date/time control can never reach `main`.

**Decision (resolved)**: v1.2 adds the **guardrail only**. Per the
constitution's stated "preventative" stance — *"no picker work is needed until
a feature first requires date entry"* — the locale-aware date-picker
*component* is **not built in v1.2**; there is no screen to consume it. The
date-entry rule (FR-015) remains binding for any future feature, and the
guardrail (FR-016) makes it enforced rather than aspirational.

**Why this priority**: Preventative only — no current member-facing pain
depends on it. It exists so the constitution's date-entry rule is enforced
rather than aspirational.

**Independent Test**: Add an automated check and confirm it fails when a native
date/time input is present in the app source and passes when none is.

**Acceptance Scenarios**:

1. **Developer (guardrail)** — **Given** the verification gates, **When** a native `<input type="date">`, `type="time">`, or `type="datetime-local">` is introduced anywhere in the app source, **Then** a gate fails before the change can merge.
2. **Developer (guardrail)** — **Given** the current app source, which collects no dates, **When** the gate runs, **Then** it passes.

---

### Edge Cases

- **JavaScript slow or unavailable**: forms are Server Action-backed. The Server Action's Zod validation remains the authoritative check; when the client layer has not yet hydrated, an invalid submit must still be rejected by the server and its error rendered in-app — never a blank failure or a native bubble.
- **Locale switched while errors are showing**: every visible validation message must re-render in the newly selected language (it cannot be a string frozen at validation time).
- **Cross-field errors**: some errors belong to a pair of fields, not one (PIN vs. PIN-confirmation). These must render clearly and not be mis-attributed to a single field.
- **Non-field errors on a form**: a Turnstile failure on sign-in, or a "this email is already a member" conflict, is not a field-validation error — these keep their existing form-level treatment and must not be forced into a field message.
- **Pasted pre-formatted values**: a member may paste an amount as `"120,00 Kč"` or with a thousands separator; the amount field must interpret or clearly reject it, not silently misread it.
- **Long messages on a small screen**: a validation message must remain readable and must not push the submit control off-screen on a 5.5" phone.
- **Server rejects what the client accepted**: if the shared schema is correctly reused this should not happen; if it does, the server error must still surface in-app against the right field.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: No form in the app MAY rely on the browser's native validation UI. The HTML `required` attribute and other native input constraints MUST NOT be the user-facing validation mechanism, and no browser-native validation bubble may appear for any invalid input on any form.
- **FR-002**: Every form MUST validate input through an in-app form-validation layer and render validation errors in-app, positioned with the field they concern.
- **FR-003**: Every validation message MUST be drawn from the localization catalogs, render in the app's active locale, and follow the established mate-to-mate tone. No validation message may be a hardcoded string.
- **FR-004**: The validation rules enforced on the client MUST be the same rules the corresponding Server Action enforces — a single shared schema, not two definitions that can drift. Any input the client accepts the server must also accept, and vice versa.
- **FR-005**: Server-side validation in each Server Action MUST remain the authoritative boundary check and MUST be unchanged in strictness — the client layer is an additional UX layer over the same rules, never a replacement.
- **FR-006**: When a member corrects an invalid field, its error message MUST clear without requiring a full re-submit.
- **FR-007**: Invalid input MUST NOT cause the member to lose other values already entered in the same form.
- **FR-008**: A visible validation message MUST re-render in the active locale when the member switches language.
- **FR-009**: Validation errors MUST be associated with their field for assistive technology, so a screen-reader user learns which field is wrong and why.
- **FR-010**: A form's submit control MUST reflect in-flight state and MUST NOT allow a duplicate submission while a submission is already in progress.
- **FR-011**: Cross-field validation errors (e.g. PIN confirmation mismatch) MUST be rendered clearly and not mis-attributed to an unrelated single field.
- **FR-012**: Form-level, non-field errors (Turnstile failure, uniqueness conflicts, generic action failures) MUST keep a distinct, in-app, localized treatment separate from field-level validation.
- **FR-013**: All interactive form controls — inputs, selects, submit buttons — MUST meet the minimum touch-target size already required by the constitution / v1.1.
- **FR-014**: The feature MUST NOT change any domain entity, balance, payment, stock, or Server Action contract; it is confined to input collection and validation presentation.
- **FR-015**: Date and time entry, if and when a screen collects it, MUST use a locale-aware picker component and MUST NOT use a native `<input type="date">`, `type="time">`, or `type="datetime-local">`.
- **FR-016**: A verification gate MUST fail if a native date/time input, or a form whose only validation is native browser constraints, is introduced into the app source.
- **FR-017**: The scope of forms covered MUST be every existing form: sign-in, PIN setup, PIN unlock, invitation accept, member invite, banking profile, beer-type add, beer-type edit, restock, stock adjust, settle "paid another way", and treasurer manual payment.

### Forms In Scope

A confirmed inventory of the forms this feature migrates (no new forms are
created):

| Form | Surface | Persona who feels it most |
|------|---------|---------------------------|
| Sign-in (email) | auth | Tereza |
| PIN setup | auth | Standa |
| PIN unlock | auth | Standa |
| Invitation accept (display name) | onboarding | Marek |
| Member invite (email + role) | admin | Pavel |
| Banking profile (IBAN, holder, Revolut, QR message) | admin | Pavel |
| Beer-type add / edit | admin | Pavel / Standa |
| Restock | admin | Standa |
| Stock adjust | admin | Standa |
| Settle "paid another way" (amount + note) | money | Marek |
| Treasurer manual payment (amount + note) | money | Jiří |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across every form in the app, triggering an invalid input on every required or constrained field produces zero browser-native validation bubbles (100% of fields).
- **SC-002**: 100% of validation messages shown to the user render in the app's active locale; none appear in a language the user did not choose.
- **SC-003**: When a member submits a form with one invalid field, they are told the reason and retain 100% of the other values they had entered.
- **SC-004**: For every form, the set of inputs accepted by the client validation layer matches the set accepted by the Server Action — zero cases where the client accepts input the server rejects, or vice versa.
- **SC-005**: A member can identify which field is wrong and why without scrolling away from that field, on a 5.5" phone screen.
- **SC-006**: A native date/time input, or a form relying solely on native browser validation, cannot reach `main` — its introduction fails a verification gate 100% of the time.
- **SC-007**: Every acceptance scenario above has a corresponding automated end-to-end assertion against the running app, and all pass.

## Assumptions

- The v1 data model and Server Actions (`specs/001-beer-consumption-ledger/`) are unchanged. v1.2 touches only the presentation and client-validation layer; server-side validation strictness is preserved exactly.
- Server-side schema validation already exists in the Server Actions; v1.2 reuses those same schemas as the client-side validation source rather than authoring new rules.
- An audit performed for this spec found **no screen currently collects a date or time**, and **no form currently uses a client-side form-validation library** — this is a greenfield migration onto the constitution v1.5.0 standard, not a partial one.
- Forms remain Server Action-backed; the client validation layer is a progressive enhancement, and the Server Action stays the authoritative validator.
- Cloudflare Turnstile on the sign-in form and the PIN attempt-limit / lockout behaviour are unchanged by this feature.
- The established mate-to-mate copy tone (and gender-neutral Czech) from the v1.1 catalog work applies to all new validation strings.
- Personas are carried from the v1 UX review (`specs/001-beer-consumption-ledger/ux-review.md`) and the v1.1 spec; no new persona research was performed for v1.2.
- The locale-aware date-entry rule (FR-015) is preventative. Per the resolved decision in User Story 4, v1.2 ships the guardrail (FR-016) only; the date-picker component itself is deferred until a feature first requires date entry, matching the constitution's stated stance.
