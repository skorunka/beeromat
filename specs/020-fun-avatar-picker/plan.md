# Implementation Plan: Fun Avatar Picker

**Branch**: `020-fun-avatar-picker` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-fun-avatar-picker/spec.md`

## Summary

Members of a beeromat club pick one of a small curated set of
inline-SVG avatars (8–12 glyphs, beer-themed + tennis-themed + a
few generic playful options) to replace their initials wherever
the app today renders a member-identity circle. The picker lives
in a new section on `/account`. The chosen key persists on the
per-club `members.avatar_key` column; nothing is stored on `users`,
so the same person logged into two clubs (future multi-club case)
can pick independently in each.

Render path:
- `lib/avatars/palette.tsx` exports a typed `AVATAR_KEYS` allowlist
  + a `<MemberAvatar code={key} fallback={initials} />` component.
- The component imports each glyph as an inline SVG (FlagIcon
  precedent from this session — Windows ships no flag emoji, so we
  avoid the same cross-platform variance for every avatar).
- Falls back to the existing initials-in-primary-tinted-circle
  (or `<CircleUser />` for empty-name members) when `avatar_key`
  is null or points at a key that's no longer in the palette.

Write path:
- `setAvatarAction({ avatarKey: string | null })` server action.
  Validates the key against `AVATAR_KEYS`, looks up the actor's
  active membership row, updates `members.avatar_key`, revalidates
  the layout. Same authz chassis as every other club-scoped action.

UI:
- `components/account/avatar-picker.tsx` (client). Grid of all
  palette options + a "Default (initials)" tile. Tap saves on
  click (no separate submit button), success ripple is a small
  `feedback-playful-motion-ok` flourish on the picked tile.
- `/account/page.tsx` gains a new `<section>` near the top (above
  the existing settings) titled "Avatar" / "Profilová ikona".

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict)

**Primary Dependencies**: Next.js 16 (App Router + Server Actions),
Drizzle ORM 0.45.x, next-intl 4.x, Tailwind 4, shadcn/ui primitives,
lucide-react for the existing `<CircleUser />` fallback.

**Storage**: Postgres via Drizzle (Neon in prod, PGlite in
integration tests). One new nullable column: `members.avatar_key`
text.

**Testing**: Vitest pyramid per Constitution v1.10.0 — unit
(`pnpm test:unit`) for the allowlist; integration
(`pnpm test:integration`) for the setAvatarAction; component
(`pnpm test:component`) for the picker UI + the `<MemberAvatar />`
swap-in.

**Target Platform**: PWA — mobile browsers primary, desktop
browsers supported. No native packaging.

**Project Type**: Single Next.js application (the only project in
the repo). No monorepo split.

**Performance Goals**: Picker renders + interacts within the same
budgets as the rest of the app — no specific p95 target. Avatar
SVGs are inline + tree-shakeable; total glyph payload should stay
under 5 KB gzipped.

**Constraints**:
- Czech sentences over labels in all picker copy. No "dlužíš"
  (n/a here but rule applies).
- Inline-SVG only (clarification Q2 → Option B). No emoji palette
  even for "easy" glyphs — uniformity > convenience.
- The picker MUST fit in a single viewport on a 360×640 phone
  (SC-004).

**Scale/Scope**: Small clubs (~10s of members per club). One
column added, one action added, one new component, one new
component used in ~5 existing render surfaces.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design. Constitution v1.10.0.*

- **I. Mobile-First PWA** ✓ — picker is a thumb-tappable grid;
  works one-handed; tap-to-save matches spec 017's one-tap pattern.
- **II. Tenant-Aware Schema, Single-Club UX** ✓ — the new
  `members.avatar_key` column lives on a row that already carries
  `club_id`. The action looks up the actor's active membership
  (per the existing authz chassis); no global state.
- **III. Track, Don't Transact** ✓ — N/A, no money path touched.
- **IV. Auditable History** ✓ — avatar changes are low-stakes,
  reversible, and out of scope for the event-log per the spec's
  Assumptions. Soft-delete + actor logging would be over-
  engineered.
- **V. UI Reversibility** ✓ — US3 + FR-004 explicitly require a
  reset path; the picker exposes a "Default (initials)" tile that
  clears the key.
- **VI. Czech-First Copy** ✓ — picker labels go into the existing
  `cs.json` / `en.json` namespaces; no English-only strings ship.
- **VII. Fresh Code Hygiene** ✓ — no new library, no version drift.
- **VIII. Testing Pyramid** ✓ — see declaration below.
- **IX. Trunk-Based Direct-to-Main** ✓ — workflow unchanged.

### Test layer declaration

*Required by Principle VIII. Constitution v1.10.0 four-layer
pyramid.*

- **Unit (`pnpm test:unit`)** — YES. The `AVATAR_KEYS` allowlist
  predicate (`isValidAvatarKey(s: string): boolean`) is a pure
  function over a frozen string set. Trivial to test with no DB
  / no DOM / no async. File: `tests/unit/avatars-allowlist.test.ts`.

- **Integration (`pnpm test:integration`)** — YES.
  `setAvatarAction` is DB-coupled (writes `members.avatar_key`,
  reads the actor's membership). Tests cover: (a) happy path
  writes the key, (b) null clears the key, (c) unknown key
  returns INVALID_KEY, (d) actor without an active membership
  is rejected. File:
  `tests/integration/set-avatar-action.test.ts`.

- **Component (`pnpm test:component`)** — YES. Two component
  tests:
  • `tests/component/avatar-picker.test.tsx` — the grid renders
    all palette options + the default tile, clicking a tile calls
    the (mocked) action with the correct key, the picked option
    is visually marked.
  • `tests/component/member-avatar.test.tsx` — the renderer shows
    the SVG glyph when given a valid key, falls back to initials
    for null, falls back for an unknown key, and falls back to
    `<CircleUser />` when initials are unavailable.

- **E2E (`pnpm test:e2e`)** — NO. Not a critical journey; no money
  path, no multi-step coordination, no concurrent-actor risk. The
  feature is fully covered by the layers above. Per Principle
  VIII, "for business-logic-only or copy-only changes, explain
  why E2E is not warranted" — here, the journey is one-tap, the
  failure modes are local-only (bad key → fallback), and the
  three lower layers verify every observable behaviour.

## Project Structure

### Documentation (this feature)

```text
specs/020-fun-avatar-picker/
├── plan.md                 # This file (/speckit-plan output)
├── research.md             # Phase 0 output
├── data-model.md           # Phase 1 output
├── quickstart.md           # Phase 1 output
├── contracts/
│   └── set-avatar.md       # Server action contract
├── checklists/
│   └── requirements.md     # /speckit-specify output (all pass)
└── tasks.md                # /speckit-tasks output (next phase)
```

### Source Code (repository root)

```text
app/[locale]/(app)/account/
└── page.tsx                # +<AvatarSection /> render

components/
├── account/
│   └── avatar-picker.tsx   # NEW — the grid + tap-save
├── nav/
│   └── user-menu.tsx       # update to use <MemberAvatar />
└── ui/
    └── member-avatar.tsx   # NEW — the renderer (key → SVG | initials)

lib/
├── avatars/
│   ├── palette.tsx         # NEW — AVATAR_KEYS + glyphs
│   └── validate.ts         # NEW — isValidAvatarKey()
└── db/
    └── schema/
        └── members.ts      # +avatar_key column

drizzle/
└── 0008_<name>.sql         # NEW — ALTER TABLE members ADD COLUMN

messages/
├── cs.json                 # +account.avatar.* keys
└── en.json                 # +account.avatar.* keys

tests/
├── unit/
│   └── avatars-allowlist.test.ts
├── integration/
│   └── set-avatar-action.test.ts
└── component/
    ├── avatar-picker.test.tsx
    └── member-avatar.test.tsx
```

**Structure Decision**: Single Next.js application (project's
sole structure — no monorepo). The picker is a new client
component, the renderer is a small server-safe component used by
both the picker and existing surfaces, the action is in the
existing `app/[locale]/(app)/account/actions.ts` (or a new file
beside it). Schema + migration follow the existing Drizzle
conventions for spec 019.

## Complexity Tracking

> No Constitution Check violations. Feature touches one new column,
> one new action, one new client component, one new renderer
> component, and a handful of existing render sites. Nothing
> requires justification beyond the spec.
