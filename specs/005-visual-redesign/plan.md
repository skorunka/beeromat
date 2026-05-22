# Implementation Plan: Visual Redesign & Design System (v1.4)

**Branch**: `005-visual-redesign` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-visual-redesign/spec.md`

## Summary

v1.4 gives beeromat a visual identity — the warm "Clubhouse" theme
(chosen proposal A) — in light and dark. The decisive finding from
inspecting the codebase: `app/globals.css` defines only **two** tokens
(`--background`, `--foreground`), yet the `components/ui/*` primitives
already speak the full shadcn token vocabulary (`bg-primary`,
`border-input`, `bg-card`, `text-muted-foreground`, `bg-accent`,
`ring-ring`, …). Those utilities reference CSS variables that were
never defined, so they generate nothing — which is *why* the app looks
unstyled. The redesign's foundation is therefore not "retune colours"
but **define the design-token set the components already expect**,
in the Clubhouse palette, light + dark.

The work, in layers: (US1) the token set + the display typeface, wired
through one source so every component lights up; (US2) a deliberate
restyle of each primitive; (US3) member-screen layout rework; (US4) a
branded welcome screen; (US5) admin screens. It adds **no domain
entities**, changes **no business logic** and **no Server Action
contract**, and adds **no runtime dependency** (`next/font` is built
into Next; Bricolage Grotesque loads from Google Fonts through it).

## Technical Context

**Language/Version**: TypeScript 6.x (strict)

**Primary Dependencies**: Next.js 16 (App Router), React 19.2, next-intl
4, **Tailwind CSS 4** (CSS-first config — `@theme` in `globals.css`, no
`tailwind.config`), shadcn/ui over base-ui, sonner, `react-hook-form` +
`@hookform/resolvers` + `zod` (the v1.2 form layer). **No new
dependency** — the display typeface loads via `next/font/google`
(built into Next).

**Storage**: Neon Postgres via Drizzle — **untouched**. No tables,
columns, migrations.

**Testing**: Vitest + PGlite (unit), Playwright (E2E). The full v1–v1.3
suite is the behavioural regression net; new Playwright checks assert
applied theme / contrast / touch targets / dark mode via emulated
`colorScheme`.

**Target Platform**: mobile-first / mobile-only installable PWA;
baseline phone 360×640; smallest supported width 360 px.

**Performance Goals**: the golden logging path stays <10 s (SC-006);
one webfont, `display: swap`, no layout shift; dark mode is pure CSS
(no JS, no flash).

**Constraints**: WCAG AA contrast in **both** themes (FR-004 — hard);
≥44 px touch targets (FR-006); presentation-only — no behaviour, entity,
or contract change (FR-010); every new string through the catalog
(FR-011); the forms standard intact (FR-012); render correct at 360×640
(FR-015).

**Project Type**: Web application (single Next.js app, App Router).

**Scale/Scope**: ~11 shared UI primitives, ~15 screens (member + auth +
admin), one new welcome screen, two catalogs, light + dark token sets.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.6.0**.

| Principle / rule | Status | Note |
|---|---|---|
| I. Mobile-First PWA (one-thumb) | ✅ Directly advances it | The whole feature is the mobile UI; ≥44 px targets retained, layouts reworked for one-thumb phone use. |
| II. Tenant-aware schema, single-club UX | ✅ Unaffected | No schema or tenancy change. |
| III. Track, don't transact | ✅ Unaffected | No money logic touched. |
| IV. Auth that disappears, bots bounce | ✅ Honored | US4 restyles the signed-out entry into a welcome screen but changes **no** auth behaviour — Turnstile + magic-link + PIN untouched. |
| V. Auditable history — incl. UI-reversibility | ✅ Unaffected | No domain rows; the reversible-action affordances from v1.1/v1.3 are restyled, not removed. |
| VI. Free-tier first | ✅ Unaffected | No new infrastructure; one Google-Fonts webfont via `next/font`. |
| i18n section (catalog, `Intl.*`) | ✅ Honored | Welcome-screen and any new copy are catalog strings; `i18n:check` covers them. |
| User Input & Forms (v1.6.0) | ✅ Honored | Forms are restyled only; the react-hook-form + Zod layer and no-native-validation rule stay — `forms:check` green. |
| Verification Gates — all seven | ✅ Honored | quickstart lists all seven; every acceptance scenario gets a Playwright assertion or a green regression spec. |
| Tech-stack table — new dependency | ✅ None | `next/font` is part of Next; Bricolage Grotesque is a Google Font fetched through it — no npm package, no amendment. |
| Test/Prod Code Separation (hard rule) | ✅ Honored | No test-only branches in shipped code; the `/design` scratch page is **removed** in this feature. |
| Spec & Task Discipline — personas, verifiable tasks | ✅ Honored | spec.md carries the Personas section; the older-eyes legibility bar is a first-class constraint; each task is bound to a gate or an assertion. |

**Result: PASS.** No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-visual-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 — token architecture, dark mode, font, contrast
├── data-model.md        # Phase 1 — no DB change; the design-token + type-scale model
├── quickstart.md        # Phase 1 — how to verify the redesign
├── contracts/
│   └── design-system.md # Phase 1 — tokens, type scale, component & verification contracts
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — files this feature adds or touches

```text
app/
├── globals.css                    # US1 — the full design-token set: every
│                                  #   shadcn semantic token, Clubhouse light
│                                  #   values + a @media(prefers-color-scheme:
│                                  #   dark) block; @theme exposes them; the
│                                  #   hardcoded Arial body font is removed
└── [locale]/
    ├── layout.tsx                 # US1 — load Bricolage Grotesque via
    │                              #   next/font/google, set the font CSS var
    ├── (app)/
    │   ├── page.tsx               # US3 — home layout rework
    │   ├── log/ tab/ settle/ bet/ # US3 — member-screen layout rework
    │   ├── account/ history/      # US3 — member-screen layout rework
    │   └── admin/**               # US5 — admin-screen restyle
    ├── (auth)/
    │   └── sign-in/               # US4 — the signed-out entry becomes a
    │                              #   branded welcome hero + the sign-in form
    └── design/                    # REMOVED — the scratch /design preview page

components/ui/                     # US2 — restyle every shared primitive
├── button.tsx  input.tsx  card.tsx  badge.tsx  label.tsx
├── dialog.tsx  dropdown-menu.tsx  separator.tsx  sheet.tsx
├── sonner.tsx  form.tsx
components/nav/bottom-nav.tsx      # US2 — restyle the persistent nav

messages/
├── cs.json  en.json               # + welcome-screen copy (and any new strings)

tests/e2e/
└── ux3-redesign.spec.ts           # NEW — theme-applied / contrast / touch-target
                                   #   / dark-mode / welcome-screen assertions
```

**Structure Decision**: No structural change to the route tree and no
new route — the welcome screen is the restyled `/sign-in` entry (a
branded hero above the existing form), not a new path. The redesign is
concentrated in `app/globals.css` (the token foundation), the
`[locale]` layout (the font), and in-place restyling of the
`components/ui/*` primitives and the screen files. The scratch
`app/[locale]/design/` preview page is deleted.

## Complexity Tracking

No Constitution Check violations — this table is intentionally empty.
