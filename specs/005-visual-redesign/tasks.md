---
description: "Task list for Visual Redesign & Design System (v1.4)"
---

# Tasks: Visual Redesign & Design System (v1.4)

**Input**: Design documents from `specs/005-visual-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/design-system.md

**Tests**: Test tasks ARE included — spec SC-008 requires every acceptance
scenario to have an automated assertion, and the constitution makes
Playwright E2E a verification gate.

**Organization**: Tasks are grouped by user story. The stories are *layers*
of the redesign — US1 (the token + type foundation) blocks the rest; US2–US5
build on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US5 maps the task to its spec user story

**Verifiable Tasks rule (constitution).** Every task is observable by a gate
(`typecheck`, `lint`, `i18n:check`, `forms:check`, `build`) or an E2E
assertion. A visual redesign cannot be "looks-good"-tested — so each task is
checked by: the v1–v1.3 behavioural regression suite staying green, plus the
computed-style assertions in `tests/e2e/ux3-redesign.spec.ts` (theme applied,
contrast, touch-target size, 360×640 layout, dark mode).

## Path Conventions

Single Next.js App Router app at the repository root: `app/`, `components/`,
`messages/`, `tests/e2e/`.

---

## Phase 1: Setup

**Purpose**: None — v1.4 adds no dependency (the display typeface loads via
`next/font`, built into Next), no env vars, no migrations. Proceed to US1.

---

## Phase 2: User Story 1 - A coherent visual identity (Priority: P1) 🎯 MVP

**Goal**: The whole app takes on the Clubhouse identity — the full design-token
set and the display typeface wired through one source, light and dark — so
every component (which already references the shadcn token vocabulary) lights
up themed.

**Independent Test**: Any screen renders in the Clubhouse palette and the
Bricolage typeface, light or dark per the OS; no screen shows the old grey
default; every v1–v1.3 E2E spec still passes.

**⚠️ BLOCKS US2–US5** — every component and screen themes from these tokens.

- [X] T001 [US1] In `app/globals.css`, define the full shadcn semantic token set on `:root` — `--background`, `--foreground`, `--card(-foreground)`, `--popover(-foreground)`, `--primary(-foreground)`, `--secondary(-foreground)`, `--muted(-foreground)`, `--accent(-foreground)`, `--destructive(-foreground)`, `--border`, `--input`, `--ring`, `--brand`, `--radius` — with the **light** Clubhouse values from data-model.md; expose them to Tailwind via the `@theme inline` block; remove the hardcoded `Arial` body `font-family`. Every text/surface pair MUST clear WCAG AA (4.5:1 body, 3:1 large/UI) — tune `--primary` / `--muted-foreground` / `--destructive` per research.md Decision 4 until they pass.
- [X] T002 [US1] In `app/globals.css`, add the `@media (prefers-color-scheme: dark)` block re-declaring the same token names with the **dark** Clubhouse values from data-model.md; verify every pair clears WCAG AA in dark too. No JS, no class toggle.
- [X] T003 [US1] In `app/[locale]/layout.tsx`, load **Bricolage Grotesque** via `next/font/google` (`display: 'swap'`, a system-stack fallback), apply its CSS variable to `<html>`, and wire it as the `--font-sans` token so all text uses it.
- [X] T004 [P] [US1] Create `tests/e2e/ux3-redesign.spec.ts` with the US1 assertions: a known surface's computed background is the Clubhouse token (not the pre-redesign default); the computed `font-family` is the Bricolage stack; sampled text/background contrast meets AA; and under Playwright's emulated `colorScheme: 'dark'` the dark token is applied and contrast still meets AA.

**Checkpoint**: The app has the Clubhouse identity in light and dark; the token foundation is ready for US2–US5.

---

## Phase 3: User Story 2 - Polished, consistent components (Priority: P2)

**Goal**: Every shared primitive is deliberately restyled into one coherent
Clubhouse component set — consistent radius, elevation, spacing, and
hover/pressed/disabled/focus states.

**Independent Test**: A given component type looks and behaves identically
everywhere; focus and pressed states are visible; every control is ≥44 px;
nothing carries a leftover default style.

- [X] T005 [US2] Restyle the form controls — `components/ui/button.tsx`, `input.tsx`, `label.tsx`, and the `form.tsx` primitives — to the Clubhouse system: token colours, the radius scale, visible focus ring, distinct hover/pressed/disabled states, ≥44 px targets. The `form.tsx` primitives keep the v1.6.0 standard (no native validation).
- [X] T006 [US2] Restyle the surface/container primitives — `components/ui/card.tsx`, `dialog.tsx`, `sheet.tsx`, `separator.tsx`, `dropdown-menu.tsx` — consistent radius, the soft warm elevation, token borders and backgrounds.
- [X] T007 [US2] Restyle the feedback primitives — `components/ui/badge.tsx` and `components/ui/sonner.tsx` (toasts) — and the shared empty-state styling, into the Clubhouse system.
- [X] T008 [US2] Restyle `components/nav/bottom-nav.tsx` — the persistent nav in the Clubhouse look, the active item using the brand accent, ≥44 px tap rows.
- [X] T009 [P] [US2] Extend `tests/e2e/ux3-redesign.spec.ts` with the US2 assertions: sampled controls are ≥44 px at 360×640; primary buttons across screens share one computed style; a focused control has a visible focus ring.

**Checkpoint**: Every component is on the Clubhouse design system.

---

## Phase 4: User Story 3 - Reworked member-facing screen layouts (Priority: P2)

**Goal**: The member screens have their spacing, hierarchy, and layout
revisited so each has a clear primary focus and a comfortable phone layout.

**Independent Test**: Each member screen has one clear focal point, lays out
well at 360×640, and keeps every action and content item from v1–v1.3.

- [ ] T010 [US3] Rework the layout of the home screen (`app/[locale]/(app)/page.tsx`) and the log screen (`app/[locale]/(app)/log/`) — home: the outstanding balance as the focal point; log: the beer tiles dominant.
- [ ] T011 [US3] Rework the layout of the tab, settle, and bet screens (`app/[locale]/(app)/tab/`, `settle/`, `bet/`) — clear focal point and comfortable rhythm on each.
- [ ] T012 [US3] Rework the layout of the account, payment-history, and session-history screens (`app/[locale]/(app)/account/`, `account/payments/`, `history/`).
- [ ] T013 [P] [US3] Extend `tests/e2e/ux3-redesign.spec.ts` with the US3 assertions: each member screen has no horizontal scroll at 360×640 and the bottom nav does not occlude content; the home balance is present and prominent.

**Checkpoint**: Member screens are reworked into the Clubhouse look.

---

## Phase 5: User Story 4 - A welcome screen for the signed-out entry (Priority: P2)

**Goal**: The signed-out entry is a branded welcome hero leading into the
unchanged magic-link sign-in; the other auth screens match the new look.

**Independent Test**: A signed-out visitor lands on a branded welcome hero and
can proceed into the existing sign-in flow.

- [ ] T014 [US4] Rework the sign-in entry (`app/[locale]/(auth)/sign-in/`) into a branded **welcome hero** in the Clubhouse look — identity + a warm one-line invitation — leading into the existing email/magic-link form with no change to auth behaviour. Add the welcome-screen copy to `messages/cs.json` and `messages/en.json` in the mate-to-mate tone; confirm `pnpm i18n:check` passes.
- [ ] T015 [US4] Restyle the remaining auth screens — the PIN gate (`components/pin/pin-gate.tsx`) and the invitation-accept screen (`app/[locale]/(auth)/invitation/[token]/`) — into the Clubhouse system, consistent with the welcome screen.
- [ ] T016 [P] [US4] Extend `tests/e2e/ux3-redesign.spec.ts` with the US4 assertions: a signed-out visit shows the branded welcome hero, and a single control leads into the sign-in form.

**Checkpoint**: The signed-out entry introduces the identity; all auth screens match.

---

## Phase 6: User Story 5 - Reworked admin screen layouts (Priority: P3)

**Goal**: The admin surfaces are brought into the same Clubhouse system.

**Independent Test**: Each admin screen uses the Clubhouse components and
layout conventions; nothing on an admin screen shows the pre-redesign look.

- [ ] T017 [US5] Restyle the Admin hub (`app/[locale]/(app)/admin/page.tsx`), the members screen, and the banking screen into the Clubhouse system.
- [ ] T018 [US5] Restyle the beer-types, pending, and balances admin screens (`app/[locale]/(app)/admin/beer-types/`, `pending/`, `balances/`) into the Clubhouse system.
- [ ] T019 [P] [US5] Extend `tests/e2e/ux3-redesign.spec.ts` with the US5 assertion: an admin screen's computed surface uses the Clubhouse tokens, consistent with the member screens.

**Checkpoint**: Every screen — member, auth, admin — is on the Clubhouse design system.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T020 Remove the scratch design-proposal page `app/[locale]/design/page.tsx` (and its now-empty `design/` directory).
- [ ] T021 Run the full Playwright suite (`pnpm exec playwright test`); fix any pre-existing v1–v1.3 spec broken by a restyle's markup/selector or visible-text change — update the spec assertion to the new markup, never the app behaviour (SC-005). Behaviour is unchanged by v1.4.
- [ ] T022 Run all seven verification gates — `typecheck`, `lint`, `test`, `i18n:check`, `forms:check`, `build`, `playwright test` — confirm all pass; walk `quickstart.md` in both light and dark on a 360-px viewport.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **US1 (Phase 2)**: the token + type foundation — **blocks US2–US5**. Start here.
- **US2 (Phase 3)**: depends on US1 (components theme from the tokens).
- **US3, US4, US5 (Phases 4–6)**: depend on US1 + US2 (screens are built from the restyled components). Independent of each other — may proceed in parallel once US2 lands.
- **Polish (Phase 7)**: after all five stories.

### Within Each User Story

- US1: light tokens (T001) and dark tokens (T002) before the E2E (T004); the font (T003) is independent.
- US2–US5: the component/screen restyle tasks before that story's E2E assertion task.
- The single E2E file `ux3-redesign.spec.ts` is created in T004 and *extended* per story (T009, T013, T016, T019) — those run after T004, sequentially (same file).

### Parallel Opportunities

- Within US1: T003 (font) ∥ T001/T002 (tokens) — different files.
- Within US2: T005, T006, T007, T008 touch distinct component files — parallelisable.
- US3, US4, US5 can each be taken by a different developer once US2 is done.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 2 (US1) — the tokens + typeface.
2. **STOP and VALIDATE**: `ux3-redesign.spec.ts` US1 assertions green — the
   app already *has* the Clubhouse identity, light and dark, because every
   component lights up from the tokens. A real, shippable visual jump.

### Incremental Delivery

1. US1 → the identity (MVP).
2. US2 → components deliberately polished.
3. US3 → member screens reworked.
4. US4 → the welcome screen.
5. US5 → admin screens.
6. Polish → remove `/design`, full regression green, seven gates.

### Notes

- [P] = different files, no dependency on an incomplete task.
- Commit after each task or logical group; reference the task ID and story.
- Presentation-only — no domain entity, balance/payment/stock/bet logic, or
  Server Action contract changes (FR-010). If a restyle changes a selector or
  visible string a v1–v1.3 E2E spec relied on, fix the **spec**, not behaviour.
- WCAG AA contrast (both themes) and the ≥44 px touch target are hard gates,
  not aspirations.
