# Implementation Plan: Custom Drink-Session Titles

**Branch**: `main` (trunk per `feedback-no-prs-trunk-based`) | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-session-titles/spec.md`

## Summary

A member taps the session subtitle on `/tab` (or the H1 on
`/history/[sessionId]`), types a name up to 60 chars, and saves.
The title persists to the existing `drink_sessions.title` column
(nullable text, today always NULL for auto-opened sessions).
Renderer fallback chain unchanged: title → "Round / Kolo".

One inline-edit client component is shared between both mount
points; a single server action does the UPDATE with `requireUnlocked`
+ active-membership gate. No new schema, no migration.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict).

**Primary Dependencies**: Existing — Next.js 16 App Router +
Server Actions, Drizzle ORM 0.45.x, next-intl 4.x, Tailwind 4,
react-hook-form 7.76 + Zod resolver, sonner for toasts. No new
packages.

**Storage**: Postgres via Drizzle. Reuses existing
`drink_sessions.title text` column — currently always NULL for
auto-opened sessions. No migration.

**Testing**: Vitest pyramid per Constitution v1.10.0 —
- Unit (`pnpm test:unit`) for the title-shape Zod schema.
- Integration (`pnpm test:integration`) for `setSessionTitleAction`
  (happy path, clearing, permission, cross-club).
- Component (`pnpm test:component`) for the inline-edit UI
  (idle → editing → saving → idle).

**Target Platform**: PWA — mobile browsers primary.

**Project Type**: Single Next.js app.

**Performance Goals**: Trivial — single UPDATE statement, single
revalidatePath. No measurable performance concerns.

**Constraints**:
- Czech-first copy; no "dlužíš" (n/a here).
- Title max 60 chars (FR-005 / spec Assumptions).
- Empty + whitespace-only input clears the title back to NULL
  (FR-004).
- Permission enforced at the server boundary (FR-007), not only
  the UI.

**Scale/Scope**: ~50 sessions per club per year. Single nullable
text column edit — no scale concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design. Constitution v1.10.0.*

- **I. Mobile-First PWA** ✓ — inline edit works one-thumb on a
  phone (tap to edit, native keyboard, save on blur or Enter).
- **II. Tenant-Aware Schema** ✓ — `drink_sessions.club_id` FK
  already exists; the action's authz scopes by club via
  `ctx.member.id` → session.clubId match.
- **III. Track, Don't Transact** ✓ — N/A, no money path.
- **IV. Auditable History** ✓ — title is low-stakes social
  metadata. Same precedent as avatar picks (spec 020) — no
  event log entry.
- **V. UI Reversibility** ✓ — every edit is reversible
  (re-edit; empty clears back to fallback). Live save, no
  multi-step confirm (SC-005).
- **VI. Czech-First Copy** ✓ — new i18n keys in both catalogs;
  fallback unchanged.
- **VII. Fresh Code Hygiene** ✓ — no new dependencies.
- **VIII. Testing Pyramid** ✓ — see test layer declaration.
- **IX. Trunk-Based** ✓ — ship to main.

### Test layer declaration

*Required by Principle VIII (Constitution v1.10.0 four-layer
pyramid).*

- **Unit (`pnpm test:unit`)** — YES. The title-shape Zod schema
  (trim + max length + empty→null normalization) is a pure
  function over a string input. File:
  `tests/unit/session-title-schema.test.ts`.

- **Integration (`pnpm test:integration`)** — YES.
  `setSessionTitleAction` is DB-coupled. File:
  `tests/integration/set-session-title-action.spec.ts`.
  Cases: (a) happy set, (b) happy clear (empty input → NULL),
  (c) whitespace-only clears, (d) over-cap trimmed/rejected,
  (e) cross-club session returns NOT_FOUND (defense in depth —
  the inline UI never offers cross-club targets), (f) any
  active member can edit (trust model from Q1).

- **Component (`pnpm test:component`)** — YES. Inline-edit
  component file:
  `tests/component/session-title-inline-edit.spec.tsx`. Cases:
  (a) idle renders the current title (or fallback for NULL),
  (b) clicking enters edit mode with pre-filled input,
  (c) Enter or blur calls the (mocked) action with the trimmed
  value, (d) Esc cancels without saving, (e) over-cap input
  rejected client-side, (f) save-in-flight shows the
  BeerSpinner inline.

- **E2E (`pnpm test:e2e`)** — NO. Not a critical journey; no
  money path, no multi-step coordination, all observable
  behaviour covered by the layers above.

## Project Structure

### Documentation (this feature)

```text
specs/022-session-titles/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   └── set-session-title.md  # Server-action contract
├── checklists/
│   └── requirements.md    # /speckit-specify output
└── tasks.md               # /speckit-tasks output (next phase)
```

### Source Code (repository root)

```text
app/[locale]/(app)/
├── tab/
│   ├── actions.ts                    # NEW — setSessionTitleAction
│   └── page.tsx                      # render <SessionTitleInlineEdit>
└── history/[sessionId]/
    └── page.tsx                      # render <SessionTitleInlineEdit>

components/
└── session/
    └── session-title-inline-edit.tsx # NEW — shared client component

lib/
└── validation/
    └── session-title.ts              # NEW — Zod schema + max-length const

messages/
├── cs.json                           # +session.title.* keys
└── en.json                           # +session.title.* keys

tests/
├── unit/
│   └── session-title-schema.test.ts
├── integration/
│   └── set-session-title-action.spec.ts
└── component/
    └── session-title-inline-edit.spec.tsx
```

**Structure Decision**: Single Next.js application. The server
action lives next to the page that primarily owns the live
session (`/tab/actions.ts`) — `/history/[sessionId]` imports the
same action. The inline-edit component sits under
`components/session/` (new directory, but the next session-
related feature will land here too — e.g. session merging / a
session menu).

## Complexity Tracking

> No Constitution Check violations. The feature is the smallest
> possible: one column already exists, one action, one component
> reused at two mount points. No schema migration. No new npm
> packages.
