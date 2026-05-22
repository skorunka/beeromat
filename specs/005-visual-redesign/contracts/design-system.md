# Contracts: Visual Redesign & Design System (v1.4)

v1.4 exposes no new Server Action and no new HTTP interface. Every v1
Server Action contract (`specs/001-beer-consumption-ledger/contracts/`)
is **unchanged** (FR-010). Its contracts are (1) the **token contract**,
(2) the **component contract** every restyled primitive must meet,
(3) the **screen contract**, and (4) the **verification contract**.

---

## 1. Token contract

- Every colour in the app MUST resolve to a token from the set in
  `data-model.md` — defined once in `app/globals.css`. A component MUST
  NOT introduce an off-token hardcoded colour.
- The token set MUST cover the full shadcn semantic vocabulary the
  `components/ui/*` primitives already reference, so each primitive
  themes with no per-component colour edit.
- The dark theme MUST be a `@media (prefers-color-scheme: dark)`
  override of the same token names — no JS, no class toggle.
- Both themes MUST clear WCAG AA: ≥4.5:1 for body text against its
  surface, ≥3:1 for large text and for interactive-component colours.
- Typography flows from one `--font-sans` token (Bricolage Grotesque,
  system fallback). Body text is never rendered below 16 px.

## 2. Component contract

Each shared primitive (`button`, `input`, `card`, `badge`, `label`,
`dialog`, `dropdown-menu`, `separator`, `sheet`, `sonner` toast, the
`form` primitives, the bottom nav), once restyled, MUST satisfy:

| # | Requirement | Source |
|---|-------------|--------|
| C1 | All colour comes from tokens — no hardcoded hex. | FR-002 |
| C2 | Consistent corner radius and elevation from the radius/elevation scale. | FR-005 |
| C3 | Visible, token-based focus state on every interactive element. | FR-006 |
| C4 | Distinct hover / pressed / disabled states. | FR-005 |
| C5 | ≥44 px touch target at 360×640 for every interactive control. | FR-006 |
| C6 | The same component type looks identical everywhere it is used. | FR-005 |
| C7 | Renders correctly in light **and** dark. | FR-016 |
| C8 | Form primitives keep the v1.6.0 standard — in-app validation, no native `required`/`pattern`, no native date/time input. | FR-012 |

## 3. Screen contract

For every screen — member (home, log, tab, settle, bet, account,
history), auth (welcome/sign-in, PIN, invitation), admin (hub, members,
banking, beer-types, pending, balances):

| # | Requirement | Source |
|---|-------------|--------|
| S1 | Built only from restyled tokenised components — no leftover default look. | FR-001, FR-008 |
| S2 | One clear primary focus per screen; primary action obvious. | FR-007 |
| S3 | Renders at 360×640 with no clipping, no horizontal scroll, no content under the bottom nav. | FR-015 |
| S4 | Every action and piece of content present in v1–v1.3 is still present and reachable. | FR-010 |
| S5 | Correct in `cs` and `en`; longer Czech strings do not overflow. | FR-011 |
| S6 | The signed-out entry is a branded welcome hero leading into the unchanged magic-link sign-in. | FR-009 |

## 4. Verification contract

Per research.md Decision 5 — three legs, all required for SC-008:

**A. Behavioural regression.** The full v1–v1.3 Playwright suite passes
unchanged in behaviour. A restyle that moves a selector or changes
visible text updates the *spec assertion*, never app behaviour.

**B. Targeted assertions** — `tests/e2e/ux3-redesign.spec.ts`:

| Spec scenario | Verified by |
|---------------|-------------|
| US1 — theme applied | a known surface's computed background is the Clubhouse cream/dark token, not the pre-redesign default |
| US1 — contrast (light) | computed text vs background contrast ≥ AA on sampled screens |
| US1 sc6 — dark theme | under `colorScheme: 'dark'`, the background is the dark roast token and contrast still ≥ AA |
| US1 sc3 — typeface | the computed `font-family` is the Bricolage stack |
| US2 — touch targets | sampled controls are ≥44 px at 360×640 |
| US3 / S3 — layout | no horizontal scroll at 360×640; bottom nav does not occlude content |
| US4 — welcome screen | a signed-out visit shows the branded welcome hero and a control into sign-in |
| US1 sc4 / SC-006 | the golden logging path still completes < 10 s |

**C. Gates.** `i18n:check` (welcome copy resolves in both catalogs),
`forms:check` (restyled forms add no native validation), `typecheck`,
`lint`, `build`.

A scenario without one of these checks is not done. "Looks good" is
out of scope for automation — *theme applied*, *contrast*, *target
size*, *renders at 360×640*, *behaviour unchanged* are all in.
