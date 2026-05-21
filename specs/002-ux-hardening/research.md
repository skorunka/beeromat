# Phase 0 — Research: UX Hardening (v1.1)

The stack is the existing v1 app, so there are no NEEDS CLARIFICATION items in
Technical Context. The decisions below resolve the *approach* questions each
user story raises.

---

## R1 — `i18n:check` gate implementation (US1)

**Decision**: A standalone `scripts/i18n-check.ts` run via `pnpm i18n:check`,
performing two checks:
1. **Catalog parity** — parse `messages/cs.json` and `messages/en.json`;
   fail if their flattened key sets differ (lists the offending keys).
2. **Hardcoded-string scan** — walk `app/**` and `components/**` `.tsx`
   files; fail on a JSX text node or a user-facing string literal in a
   small allowlist of attributes (`placeholder`, `aria-label`, `alt`,
   `title`, toast calls) that is a non-trivial literal rather than a
   `next-intl` lookup. Strings that are clearly non-UI (class names,
   `data-*`, route paths, `console.*` args, test ids) are excluded by
   simple, documented heuristics.

**Rationale**: The gate must be *unskippable* and *cheap*. A script that diffs
catalogs is exact. The hardcoded-string scan is necessarily heuristic — a
perfect detector is undecidable — but a conservative scan that flags obvious
JSX text and the common UI attributes catches the v1 failure mode (whole
screens of literal English) without drowning the build in false positives.
False positives are silenced by extracting the string, not by an inline
ignore, so the pressure always points toward the catalog.

**Alternatives considered**: an ESLint plugin (`eslint-plugin-i18next` or
similar) — heavier, another dependency, and its rule set is broader than we
need; rejected in favour of a ~100-line project-specific script we fully
control. A TypeScript-AST-based scan — more precise but far more code;
the regex/JSX-text heuristic is sufficient at this codebase size.

---

## R2 — Localizing ~15 existing screens (US1)

**Decision**: Expand `messages/cs.json` and `messages/en.json` from the
current auth/PIN-only catalogs to a full set, namespaced by screen
(`log.*`, `tab.*`, `settle.*`, `treasurer.*`, `bet.*`, `history.*`,
`admin.*`, `common.*`). Server Components read messages via
`getTranslations`; Client Components via `useTranslations` (already used by
`beer-grid` and `pin-gate`). Czech is authored as the primary catalog; English
mirrors it.

**Rationale**: next-intl is already wired (locale-segment routing, the two
catalogs, the `useTranslations` hook in use). The work is catalog authorship +
swapping literals for lookups, not new infrastructure. Namespacing by screen
keeps `i18n:check`'s parity diff readable and lets each US1 task own one
namespace.

**Alternatives considered**: a flat catalog — rejected; ~200 keys flat is
unnavigable. Machine-translating English→Czech — rejected; the treasurer/stock
domain terms (variable symbol, restock, dispute) need a human-correct Czech
register, authored deliberately.

---

## R3 — Touch-target sizing (US2)

**Decision**: Audit `components/ui/button.tsx` size variants. The `default`
size must yield a ≥44 px hit target; `sm` (currently ~28 px, `h-7`) is the
v1 offender used in pending-list and beer-type-manager. Replace `size="sm"`
on *action* buttons with a size meeting 44 px, or raise the `sm` variant's
min-height. Verify with a Playwright test at 360×640 that measures rendered
button boxes.

**Rationale**: Touch-target failures are measurable, so they get a test, not
a hope (Verifiable Tasks rule). One viewport assertion over the action buttons
is the cheapest enforcement.

**Alternatives considered**: a global CSS min-height on all buttons —
rejected; icon-only and inline-text buttons have legitimate smaller forms; the
rule is scoped to *primary action* controls per the spec's Assumptions.

---

## R4 — Persistent bottom nav + Admin hub (US7)

**Decision**: A `components/nav/bottom-nav.tsx` Client Component rendered by
`app/[locale]/(app)/layout.tsx`, fixed to the viewport bottom, showing the
daily destinations (Home, Log, Tab, Bet, History). Role-gated entries
(Treasurer, Stock, Admin) are decided server-side in the layout from the
session role and passed as props, so the client component never needs the
session. The Admin hub is a new `app/[locale]/(app)/admin/page.tsx` Server
Component linking members / banking / beer-types.

**Rationale**: The `(app)` layout already resolves the session and role —
it's the natural, single place to compute nav visibility (FR-013). A fixed
bottom bar is the established mobile pattern and keeps the daily flows one tap
apart (SC-007). Bottom padding on the layout's content prevents occlusion.

**Alternatives considered**: a top nav / hamburger — rejected; bottom nav is
thumb-reachable, the constitution's one-thumb mandate. Per-page nav — rejected;
duplicates markup and drifts.

---

## R5 — Route loading feedback (US8)

**Decision**: Use Next.js App Router `loading.tsx` files. A shared
`app/[locale]/(app)/loading.tsx` covers the group; data-heavy routes
(treasurer pending, balances, history) get their own `loading.tsx` with a
skeleton shaped like their content.

**Rationale**: `loading.tsx` is the framework-native, zero-JS-wiring way to
show an instant placeholder during a Server Component navigation — it
satisfies SC-008 (feedback within 300 ms) for free.

**Alternatives considered**: manual `useTransition` spinners on every Link —
rejected; `loading.tsx` is automatic and covers the server-render wait that a
client spinner cannot.

---

## R6 — Confirm-undo and forgot-PIN: reuse, don't build (US4, US5)

**Decision**: Neither story needs a new Server Action.
- **US4** surfaces the existing `voidConfirmedPaymentAction` (already in
  `app/[locale]/(app)/admin/pending/actions.ts`). The treasurer pending screen
  gains a view of recently-confirmed payments with an "Undo confirmation"
  control opening a reason dialog.
- **US5** reuses the existing magic-link request path (`requestMagicLinkAction`
  — Turnstile-gated, rate-limited). The PIN unlock screen gains a "Forgot PIN"
  affordance that drives the same request for the signed-in user's email.

**Rationale**: The v1 review's lesson F6 was precisely that the *action layer*
was complete and only the *UI* was missing. Building new actions would
contradict the finding. Reusing `requestMagicLinkAction` keeps US5 inside
Principle IV's bot/rate-limit protections automatically (FR-010).

**Alternatives considered**: a dedicated `resetPin` action — rejected;
losing the PIN already *means* "re-authenticate via magic link", which is
exactly the existing flow.

---

## Summary

No external research or dependency additions. v1.1 is an in-place refactor of
presentation + navigation over an unchanged data and action layer. The single
genuinely new build artifact is the `i18n:check` script (R1) — itself the
constitution v1.4.0 gate this whole feature is meant to honor.
