# Implementation Plan: Picker Avatars

**Branch**: `024-picker-avatars` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

Replace the three native `<select>` member pickers with
avatar-bearing custom controls:

- `/log/for` member picker → MEMBER TILE GRID (matches the
  beer tile grid already on the same form).
- `/match` new-agreement seat picker (per seat, 2-4 seats) →
  AVATAR DROPDOWN built on the existing `DropdownMenu`
  primitive (base-ui via shadcn, already in use on the admin
  kebab + language switcher).
- `/match/[id]` edit form → same avatar dropdown per seat.

Both shapes reuse `MemberAvatar` (spec 023 size variants —
`row` for tiles, `inline` for dropdown options). The
`/match` dropdowns disable members already assigned to
another seat in the same agreement (UI-layer guard backing
the existing server-side duplicate-seat validator).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19.2,
Next.js 16.2 (App Router, RSC + client components for the
interactive pickers).

**Primary Dependencies**: shadcn/ui DropdownMenu (already
present, base-ui `@base-ui/react/menu`), Tailwind 4,
react-hook-form (for `/match` seat fields), Lucide icons
for the chevron on the dropdown trigger.

**Storage**: Postgres (Neon prod, PGlite tests). No schema
changes. Two existing member-list queries get extended to
project `avatarKey` + `avatarUploadAt`.

**Testing**: Vitest unit, Vitest + PGlite integration,
Vitest + RTL + jsdom component (Constitution v1.10.0
four-layer pyramid). No E2E this spec.

**Target Platform**: PWA (mobile-first 360-wide), Czech-
first copy. The tile grid wraps responsively; the dropdown
opens upward when near the viewport bottom (DropdownMenu
primitive handles this).

**Project Type**: Single Next.js App Router project.

**Performance Goals**: Picker opens with no perceptible
delay vs. native `<select>`. Avatar URLs share the browser
cache established by spec 023 (same `Cache-Control:
immutable` + version-busting `?v=` URL pattern).

**Constraints**: No layout shift on fallback variants. The
existing form submission contracts (`logBeerOnBehalfAction`
+ match-agreement create/edit) accept the same payload —
picker changes are UI-only. No new copy.

**Scale/Scope**: 3 surfaces touched, 2 member-list queries
extended, 1 new shared `MemberPicker` component family
(tile + dropdown variants), ~30 active members per club
upper bound.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Tenant-aware DB reads/writes | Pass | `listActiveClubMembers` + the `/log/for` inline query already filter by `club_id` + `isActive`. No writes added. |
| V. UI reversibility | Pass | Picker selection is form-state; pre-submit changes lose nothing. No destructive action added. |
| VI. Czech-first copy | Pass | No new strings. Existing form labels + placeholder copy reused. |
| VIII. Testing Pyramid | See Test layer declaration below. |
| IX. Trunk-based | Pass | Ships direct to main per `feedback-no-prs-trunk-based`. |

### Test layer declaration

- **Unit (`pnpm test:unit`)** — N/A. No new pure functions.
  The "already-assigned in this agreement" predicate is
  trivially derivable from form state; covered by component
  layer below.
- **Integration (`pnpm test:integration`)** — REQUIRED.
  Two extended member-list queries (`listActiveClubMembers`
  in `match-agreements.ts`; the inline query in `/log/for/
  page.tsx`, extracted into a query helper for testability)
  each get a regression test asserting the new avatar
  fields surface in result rows. 2 specs.
- **Component (`pnpm test:component`)** — REQUIRED. Three
  passes: (a) the new `MemberPickerGrid` component (tile
  shape) — renders all candidates, selection callback fires,
  fallback chain works at row size. (b) The new
  `MemberPickerDropdown` component (seat shape) — renders
  options, fires onChange, disables already-assigned members
  given a "disabled set" prop. (c) Wiring smoke test on
  `LogOnBehalfForm` confirming the grid picker drives the
  same `setMemberId` state the native select drove.
- **E2E (`pnpm test:e2e`)** — N/A. No crucial journey
  introduced; the on-behalf log + match-agreement journeys
  are pending separate crucial-journey E2E specs (Constitution
  VIII deferred queue). Per `feedback-dev-velocity-priority`,
  no E2E here.

## Project Structure

### Documentation (this feature)

```text
specs/024-picker-avatars/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — shape + disable-set + a11y decisions
├── data-model.md        # Phase 1 — query shape diffs (no schema)
├── quickstart.md        # Phase 1 — manual walkthrough
├── contracts/
│   ├── member-picker-grid.md      # tile-shape API
│   └── member-picker-dropdown.md  # dropdown-shape API
└── tasks.md             # Phase 2 — /speckit-tasks (not yet created)
```

### Source Code (rendered surfaces + new components)

```text
components/ui/                         # MAY add: index re-exports
components/picker/                     # NEW directory
├── member-picker-grid.tsx             # NEW (tile shape, /log/for)
└── member-picker-dropdown.tsx         # NEW (dropdown shape, /match seats)

components/log/
└── log-on-behalf-form.tsx             # MODIFIED: <select> → <MemberPickerGrid>

app/[locale]/(app)/match/
├── NewMatchAgreementForm.tsx          # MODIFIED: <select> per seat → <MemberPickerDropdown>
├── EditAgreementForm.tsx              # MODIFIED: same swap
└── page.tsx                           # MODIFIED: query call returns avatar fields

app/[locale]/(app)/log/for/
└── page.tsx                           # MODIFIED: query returns avatar fields

lib/db/queries/
├── match-agreements.ts                # EXTEND: listActiveClubMembers
│                                      #          returns avatar fields
└── members.ts                         # NEW (or extend an existing module):
                                       # extract /log/for's inline query into
                                       # a testable helper, also returning
                                       # avatar fields
```

```text
tests/integration/
├── list-active-club-members-avatar-fields.spec.ts   # NEW
└── list-other-active-members-avatar-fields.spec.ts  # NEW

tests/component/
├── member-picker-grid.spec.tsx        # NEW
├── member-picker-dropdown.spec.tsx    # NEW
└── log-on-behalf-form.spec.tsx        # NEW (or EXTEND if exists)
```

**Structure Decision**: A `components/picker/` directory is
the right home for the two new shared components. They share
nothing with the avatar-rendering primitive (`components/ui/
member-avatar.tsx`) other than consuming it, so they don't
belong under `components/ui/`. Both consumers (`/log/for` +
`/match`) keep their existing form controllers and just
swap out the inner picker JSX.

## Complexity Tracking

No constitution violations.
