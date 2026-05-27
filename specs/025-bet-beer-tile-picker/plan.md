# Implementation Plan: Bet-Beer Tile Picker

**Branch**: `025-bet-beer-tile-picker` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

Replace the collapsed `<details>` + native `<select>` bet-beer
override on the match-result form with an always-visible tile
grid that matches `/log`'s beer-tile pattern. First tile is
"Auto · {loserLastBeerName}", pre-selected, representing "use
the server default". Subsequent tiles are one per in-stock
active beer in the club catalog. Tapping the Auto tile sends
no override; tapping any other tile sends
`betBeerOverrideId = <picked>` on submit. The 5-min reverse
window + the server contract are unchanged.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19.2,
Next.js 16.2 (App Router; client component for the picker).

**Primary Dependencies**: Tailwind 4 (tile classes), next-intl
4.x (two new keys + four removed). No new packages.

**Storage**: Postgres (Neon prod, PGlite tests). No schema
changes. The page extends its existing `Promise.all` with one
extra `lastBeerForMember` query to source the Auto tile label.

**Testing**: Vitest unit, Vitest + PGlite integration, Vitest
+ RTL + jsdom component (Constitution v1.10.0 four-layer
pyramid). No E2E this spec.

**Target Platform**: PWA (mobile-first 360-wide), Czech-first
copy. The picker fits two tiles per row on a 360-wide phone
(`grid-cols-2 gap-2`).

**Project Type**: Single Next.js App Router project.

**Performance Goals**: One additional query on the
agreement-detail page load (`lastBeerForMember`). Runs in
parallel with the existing `betBeerOptions` + `agreement` +
`members` queries via `Promise.all` — no critical-path cost.

**Constraints**: No layout shift between tile variants. No
regression on the `recordResultAction` contract (the override
field flows through unchanged). The collapsed `<details>` +
its native `<select>` are removed entirely.

**Scale/Scope**: 1 form touched (RecordResultForm), 1 page
extended (agreement detail), 1 component swap (the picker),
2 new i18n keys, 4 obsolete keys removed.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Tenant-aware DB reads/writes | Pass | `betBeerOptions` + `lastBeerForMember` both already filter by `clubId`. No writes added. |
| V. UI reversibility | Pass | Picker is pre-submit form state; tile switches are free. Existing 5-min `reverseResultAction` window unchanged. |
| VI. Czech-first copy | Pass | Two new keys (`autoLabel`, `autoFallback`) added Czech-first. Four obsolete keys removed (no consumers). |
| VIII. Testing Pyramid | See Test layer declaration below. |
| IX. Trunk-based | Pass | Ships direct to main per `feedback-no-prs-trunk-based`. |

### Test layer declaration

- **Unit (`pnpm test:unit`)** — N/A. No new pure functions
  (no validators, no formatters). Tile-selection state is
  trivial useState; the "is auto selected" predicate is
  inline in the JSX.
- **Integration (`pnpm test:integration`)** — N/A. No new
  query; no contract change to `recordResultTx` or
  `reverseResultAction`. The existing match-settle integration
  tests (`match-settle-with-bet.spec.ts`,
  `match-agreement-tx.spec.ts`, `match-bet-summary.spec.ts`)
  continue to cover the data side end-to-end.
- **Component (`pnpm test:component`)** — REQUIRED. New
  spec file for the swapped `RecordResultForm`: tile grid
  renders, Auto tile pre-selected, tapping non-Auto tile
  flips selection, submit sends override on non-Auto and
  omits it on Auto, picker hidden for not-for-beer or
  not-authorized states.
- **E2E (`pnpm test:e2e`)** — N/A. No crucial journey
  introduced; match-settle is already on the deferred
  crucial-journey list (Constitution VIII). Per
  `feedback-dev-velocity-priority`, no E2E here.

## Project Structure

### Documentation (this feature)

```text
specs/025-bet-beer-tile-picker/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — tile shape + Auto label decisions
├── data-model.md        # Phase 1 — no schema, page query diff
├── quickstart.md        # Phase 1 — manual walkthrough
├── contracts/
│   └── bet-beer-tile-grid.md   # UI contract for the new tile grid
└── tasks.md             # Phase 2 — /speckit-tasks (not yet created)
```

### Source Code (touched files)

```text
app/[locale]/(app)/match/[agreementId]/
├── page.tsx                    # MODIFIED: ADD `lastBeerForMember(ctx.member.id, ctx.club.id)`
│                               # call to the Promise.all; pass result name as
│                               # `loserLastBeerName?: string | null` prop to
│                               # RecordResultForm.
└── RecordResultForm.tsx        # MODIFIED: remove <details> + <select>; replace
                                # with an always-visible tile grid; thread
                                # loserLastBeerName into the Auto tile label.

messages/
├── cs.json                     # MODIFIED: add betPicker.autoLabel +
│                               # autoFallback; drop betPicker.label,
│                               # defaultHint, override, submitHint.
└── en.json                     # MODIFIED: same.
```

```text
tests/component/
└── record-result-form.spec.tsx # NEW: tile rendering + Auto preselect +
                                # submit-with-override + submit-without-override
                                # + hidden-when-not-for-beer.
```

**Structure Decision**: No new shared component is justified —
the tile grid is small (h-16 button per beer, mirror of
`/log/log-on-behalf-form.tsx`'s beer side) and lives inside
the form's render tree. If a future spec needs the same grid
on another surface, it can be extracted then.

## Complexity Tracking

No constitution violations.
