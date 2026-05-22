# Phase 0 Research: Visual Redesign & Design System (v1.4)

The spec carried one clarification (dark mode) — resolved by the user
before planning: v1.4 ships a dark Clubhouse theme. No external library
research is needed — the redesign uses only the existing stack plus
`next/font` (built into Next). This document records the design
decisions the plan rests on.

## Decision 1 — Token architecture: define the vocabulary the components already speak

**Decision**: In `app/globals.css`, define the **full shadcn semantic
token set** the `components/ui/*` primitives already reference —
`--background`, `--foreground`, `--card(-foreground)`,
`--popover(-foreground)`, `--primary(-foreground)`,
`--secondary(-foreground)`, `--muted(-foreground)`,
`--accent(-foreground)`, `--destructive(-foreground)`, `--border`,
`--input`, `--ring`, `--radius` — as CSS custom properties on `:root`,
and expose them to Tailwind utilities via the `@theme` block. One
source; every component themes from it.

**Rationale**: Today `globals.css` defines only `--background` and
`--foreground`. The primitives use `bg-primary`, `border-input`,
`bg-card`, `text-muted-foreground`, etc. — utilities whose CSS
variables are undefined, so Tailwind 4 emits nothing and the
components render unstyled. That **is** the "no theme" the redesign
exists to fix. Defining the set the components expect makes them light
up from a single edit; FR-002 ("all colour from one token source") is
then structural, not a discipline.

**Alternatives considered**: rewriting every component to use ad-hoc
colours — rejected: it scatters the palette and abandons the token
indirection that makes dark mode and future retuning a one-file change.

## Decision 2 — Dark mode: pure CSS `prefers-color-scheme`, no JS

**Decision**: The dark theme is a second `:root` token block inside
`@media (prefers-color-scheme: dark)`. No `.dark` class, no JS toggle,
no `localStorage` — the app simply follows the OS colour-scheme
preference (FR-016).

**Rationale**: FR-016 requires *following the OS preference* with **no
flash of the wrong theme**. A CSS media query is applied by the browser
before first paint — there is physically no flash, and no hydration
concern. A JS/class-toggle approach is the *only* thing that introduces
a flash (and needs a blocking inline script to mitigate it). Since no
in-app toggle is required, the media query is both simpler and
strictly better here. Playwright can emulate it (`colorScheme: 'dark'`)
so dark mode is fully E2E-testable.

## Decision 3 — Display typeface: Bricolage Grotesque via `next/font`

**Decision**: Load **Bricolage Grotesque** through `next/font/google`
in the `[locale]` layout, exposed as a CSS variable and wired into the
Tailwind `--font-sans` token; `display: 'swap'` with a system
fallback stack. It is used app-wide — characterful for headings,
perfectly legible for body at the app's generous sizes — one font
load, replacing today's hardcoded `Arial` fallback.

**Rationale**: `next/font` self-hosts the font (no runtime request to
Google, no layout shift, privacy-clean) and is built into Next — **no
new dependency**. Bricolage Grotesque is the typeface from the chosen
`/design` proposal: friendly and distinct, with the weight range
(regular → extrabold) the type scale needs. One family keeps the
golden-path bundle light (Marek's speed constraint, SC-006).

**Alternatives considered**: a separate body font — rejected, a second
webfont for marginal benefit; the system stack — rejected, it is the
current no-identity state.

## Decision 4 — Contrast: the brand amber is an accent, not a text-bearing fill

**Decision**: Honey Amber `#B5701A` is the **brand accent** — used for
the focus ring, the active-nav indicator, large hero/heading touches,
and highlights — where it bears no small text. The **primary
button fill** uses a *deepened* honey (`--primary` ≈ `#8A5214` light /
a brightened `#D98E2E` dark) so its foreground text clears WCAG AA. The
secondary-text token (`--muted-foreground`) is **darkened** from the
"Malt Grey" swatch (`#8C7B62`) to a value that passes AA on cream.

**Rationale**: FR-004 is a hard constraint. Mid-tone `#B5701A` does not
reach 4.5:1 with either near-white or near-black text, and the raw Malt
Grey is too light for AA body text on the cream background. The
Clubhouse *character* is preserved (amber is still everywhere the eye
lands); only the text-bearing surfaces are tuned. Every final token
pair is verified against a contrast checker during implementation
(US1) — the tables in data-model.md are the starting point, AA the
gate.

## Decision 5 — Verifying a redesign in E2E

**Decision**: Verification is three-legged:
1. **Regression** — the full v1–v1.3 Playwright suite must pass
   unchanged in behaviour; where a restyle changes a selector or
   visible text, the spec is updated to the new markup, never the
   behaviour (SC-005).
2. **Targeted assertions** — a new `ux3-redesign.spec.ts` reads
   computed styles to assert: the Clubhouse tokens are applied (a known
   surface is the cream/dark value, not the old default); text/UI
   contrast meets AA; controls are ≥44 px at 360×640; the welcome
   screen renders; and — under Playwright's emulated
   `colorScheme: 'dark'` — the dark theme is applied.
3. **Gates** — `i18n:check` (welcome copy resolves in both catalogs),
   `forms:check` (restyled forms add no native validation), `build`.

**Rationale**: "Looks good" is not machine-checkable, but *theme
applied*, *contrast ratio*, *touch-target size*, *renders at 360×640*,
and *behaviour unchanged* all are. This satisfies SC-008 honestly
without pretending a test can judge aesthetics.

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where the design tokens live | full shadcn set in `globals.css` `@theme`/`:root` (Decision 1) |
| How dark mode is delivered | CSS `@media (prefers-color-scheme: dark)`, no JS (Decision 2) |
| Display typeface + loading | Bricolage Grotesque via `next/font/google` (Decision 3) |
| Honey-amber vs AA contrast | amber = accent; primary fill = a deepened, contrast-tuned amber (Decision 4) |
| How a redesign is verified | regression suite + computed-style assertions + gates (Decision 5) |
| New dependency? | none — `next/font` is built into Next |

## Sources

No external sources — v1.4 uses the existing project stack; `next/font`
and `prefers-color-scheme` are platform features. WCAG 2.1 AA contrast
ratios (4.5:1 body, 3:1 large text / UI components) are the FR-004 bar.
