# Contract: UI, Navigation & Gate — UX Hardening (v1.1)

**Feature**: `002-ux-hardening` | **Phase**: 1 — Design

v1.1 exposes **no new server actions or queries**. Its contracts are the
verification gate, the navigation surface, and the UI behaviours that the
acceptance scenarios and E2E specs assert against. Each contract below is
written so a Playwright assertion (or the gate script) can verify it.

---

## C1 — `i18n:check` gate (US1)

`pnpm i18n:check` exits **non-zero** when either holds:

- **Catalog parity fails** — the flattened key sets of `messages/cs.json`
  and `messages/en.json` differ. Output lists each key present in one and
  missing from the other.
- **Hardcoded string found** — an `app/**` or `components/**` `.tsx` file
  contains a user-facing literal (JSX text node; or a `placeholder` /
  `aria-label` / `alt` / `title` attribute; or a `toast.*` argument) that is
  a non-trivial literal string rather than a catalog lookup. Output lists
  `file:line` for each.

Exits **zero** when the UI is fully catalog-driven and the catalogs match.
The gate joins `typecheck / lint / test:unit / build / test:e2e` as the
sixth verification gate (constitution v1.4.0).

---

## C2 — Locale resolution (US1)

- A request's locale comes from the URL locale segment (`/cs/…`, `/en/…`),
  as today; an unset member preference resolves to the club default (`cs`).
- Every screen renders all user-facing text from the active catalog. A
  missing key surfaces as a build/gate failure, never as a raw key shown to
  a user.

---

## C3 — Persistent navigation (US7)

- A bottom navigation bar is present on every `(app)` screen.
- It always shows the **daily** destinations: Home, Log, Tab, Bet, History.
- It shows **role-gated** entries only when the member's role satisfies them:
  Treasurer (treasurer/club_admin), Stock (stock_manager/club_admin), Admin
  (club_admin).
- Tapping any entry routes directly to that destination — no intermediate
  home screen.
- The bar does not occlude page content or the on-screen keyboard.

## C4 — Admin hub (US7)

- `/{locale}/admin` is a hub screen, reachable in one tap by a `club_admin`.
- It links to: member management, banking profile, beer-types & stock.
- Non-admins reaching the route are redirected away (existing `requireRole`
  behaviour).

---

## C5 — Treasurer pending row (US3)

For each claimed payment, the row contract is:

- Amount and member name are the visually dominant elements.
- `Confirm received` and `Dispute` sit on a dedicated action line, separated
  by a clear gap; neither is within accidental-tap distance of the other.
- Every action control is ≥44×44 px (shared with C7).
- The row does not wrap into an ambiguous layout at a 360 px width.

## C6 — Undo a confirmation (US4)

- The treasurer view lists recently **confirmed** payments with an
  `Undo confirmation` control.
- Activating it opens a reason prompt; submitting calls the existing
  `voidConfirmedPaymentAction`.
- On success the payment leaves the confirmed state and the member's balance
  returns to its pre-confirmation value.
- The control is offered **only** for payments currently `confirmed` — never
  for `claimed`, `disputed`, or already-`voided` payments.

---

## C7 — Touch targets (US2)

- Every primary **action** button (log, confirm, dispute, transfer, save,
  restock, adjust, record, "I paid", undo) renders with a hit target of at
  least 44×44 CSS px at a 360×640 viewport.
- Purely navigational links are out of scope for this contract (covered by
  C3/C4).

---

## C8 — Forgot-PIN escape (US5)

- The device-PIN **unlock** screen presents a `Forgot PIN` action.
- It is available **before** the five-attempt lock-out (i.e. on a normal
  unlock screen, not only the locked screen).
- Activating it triggers a magic-link email for the signed-in user via the
  existing `requestMagicLinkAction` — inheriting its Turnstile gate and
  rate limiting — and shows a "check your email" confirmation.
- It consumes **no** PIN attempts.

---

## C9 — Bet screen no-session guidance (US6)

- When no drink session is open, the bet-transfer screen MUST show guidance
  text explaining that a session starts when the first beer is logged, plus
  a link/route to the log screen.
- It MUST NOT present a bare dead end.

---

## C10 — Loading feedback (US8)

- Navigating to any `(app)` route shows a loading placeholder
  (skeleton) until the destination's content is ready.
- The placeholder appears within 300 ms of the tap (SC-008).
