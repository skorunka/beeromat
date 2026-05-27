# Implementation Plan: Post-Shipping Polish Round (A-E)

**Branch**: `026-polish-round-a-e` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

Three concrete changes (A-C-E from the audit, D dropped as a
false positive) consolidating the four already-shipped polish
specs:

1. **A + C** — extract a shared `BeerTile` component with
   two size variants (`'card'` h-32 with price, `'tile'`
   h-16 name-only) and route the three beer-picker
   call-sites (`/log`, `/log/for`, match-result form)
   through it.
2. **B** — extend the on-behalf review banner with the
   logger's avatar inline, closing a spec 023 surface gap.
3. **E** — add a documentation comment to
   `home-one-tap-log.tsx` explaining why the home picker
   intentionally uses a dropdown (not a tile grid) so a
   future audit doesn't re-flag this.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19.2,
Next.js 16.2.

**Primary Dependencies**: Tailwind 4 (tile classes),
MemberAvatar from spec 023, lucide Beer icon. No new packages.

**Storage**: Postgres (Neon prod, PGlite tests). No schema
changes. One existing query (`getOnBehalfReviewForMember` in
`lib/db/queries/on-behalf-review.ts`) extended to project
logger avatar fields.

**Testing**: Vitest unit, Vitest + PGlite integration, Vitest
+ RTL + jsdom component. No new E2E.

**Target Platform**: PWA (mobile-first 360-wide), Czech-first
copy. No new copy.

**Project Type**: Single Next.js App Router project.

**Performance Goals**: Zero new round-trips. The on-behalf-
review query just projects two nullable columns from an
already-joined members table.

**Constraints**: No regression on the four existing
component-test specs that touch the affected files. Tile-
click contract on the bet-beer picker (spec 025) must keep
working through the BeerTile wrapper.

**Scale/Scope**: 1 new component (`BeerTile`), 3 component
refactors (beer-grid, log-on-behalf-form, RecordResultForm),
1 query extension, 1 banner avatar add, 1 doc comment.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Tenant-aware DB reads/writes | Pass | `getOnBehalfReviewForMember` already filters by `clubId`. |
| V. UI reversibility | Pass | No destructive interactions added. |
| VI. Czech-first copy | Pass | No new copy keys. |
| VIII. Testing Pyramid | See Test layer declaration below. |
| IX. Trunk-based | Pass | Ships direct to main. |

### Test layer declaration

- **Unit (`pnpm test:unit`)** — N/A. No new pure functions.
- **Integration (`pnpm test:integration`)** — REQUIRED for
  US2 (one new spec verifying the on-behalf-review query
  projects the new logger avatar fields).
- **Component (`pnpm test:component`)** — REQUIRED:
  - New `tests/component/beer-tile.spec.tsx` covering both
    size variants (card + tile), selected state, click,
    disabled (out-of-stock) state.
  - Extend `tests/component/on-behalf-review-banner.spec.tsx`
    with a "logger avatar renders inline" assertion.
  - The existing `tests/component/home-one-tap-log.spec.tsx`
    + `record-result-form.spec.tsx` (spec 025) should pass
    unchanged after the refactor.
- **E2E (`pnpm test:e2e`)** — N/A. No crucial journey
  introduced.

## Project Structure

### Documentation (this feature)

```text
specs/026-polish-round-a-e/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — small, lean
├── data-model.md        # Phase 1 — one query diff
├── quickstart.md        # Phase 1 — manual walkthrough
├── contracts/
│   └── beer-tile.md     # the new component's API contract
└── tasks.md             # Phase 2 — /speckit-tasks
```

### Source Code (touched files)

```text
components/log/
├── beer-tile.tsx                # NEW: BeerTile component (US1)
├── beer-grid.tsx                # MODIFIED: uses <BeerTile size='card' /> (US1)
└── log-on-behalf-form.tsx       # MODIFIED: uses <BeerTile size='tile' /> (US1)

app/[locale]/(app)/match/[agreementId]/
└── RecordResultForm.tsx         # MODIFIED: uses <BeerTile size='tile' /> for
                                 #            non-Auto tiles; Auto tile stays inline (US1)

lib/db/queries/
└── on-behalf-review.ts          # MODIFIED: extend query to project
                                 #            loggerMemberId + loggerAvatarKey +
                                 #            loggerAvatarUploadAt (US2)

components/home/
├── on-behalf-review-banner.tsx  # MODIFIED: render <MemberAvatar size="inline" />
                                 #            before logger name (US2)
└── home-one-tap-log.tsx         # MODIFIED: add intentional-dropdown comment (US3/E)

app/[locale]/(app)/page.tsx      # MODIFIED: pass through new avatar fields from
                                 #            the on-behalf-review query to the banner
```

```text
tests/
├── integration/on-behalf-review-avatar-fields.spec.ts  # NEW (US2)
└── component/
    ├── beer-tile.spec.tsx                              # NEW (US1)
    └── on-behalf-review-banner.spec.tsx                # MODIFIED (US2)
```

**Structure Decision**: `BeerTile` lives at
`components/log/beer-tile.tsx` (per spec Q3 → ⅰ —
adjacent to its existing consumers; not over-promoted to
`components/ui/`).

## Complexity Tracking

No constitution violations.
