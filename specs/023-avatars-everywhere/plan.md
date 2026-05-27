# Implementation Plan: Avatars Everywhere

**Branch**: `023-avatars-everywhere` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: [Feature specification](./spec.md)

## Summary

Render `<MemberAvatar />` next to every member-name surface that
shipped without one — six rendering sites across `/admin/pending`
(pending + confirmed lists), `/bet` (drinks-you-can-take +
past-bets lists), `/history/[sessionId]` (bet-transfer rows),
and `/tab` (on-behalf attribution). Reuses the existing avatar
primitive shipped by spec 020 (glyph palette) and spec 021
(photo upload).

Technical approach: extend a small number of existing query
result shapes to include `memberId`, `avatarKey`, and
`avatarUploadAt` for each named member; add a `size` variant
prop to `MemberAvatar` (two new variants: `inline` for
text-flow attribution, `row` for list cards); thread the new
fields into the existing renderers. No schema change; no new
endpoint; no new copy.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19.2,
Next.js 16.2 (App Router, RSC + Server Actions).

**Primary Dependencies**: Drizzle ORM 0.45 (query extensions),
next-intl 4.x (no new keys), Tailwind 4 (size classes), Lucide
React (existing CircleUser fallback inside MemberAvatar).

**Storage**: Postgres (Neon in prod, PGlite for integration
tests). No schema changes. Reuses `members.avatar_key`,
`members.avatar_upload_at` (from spec 021), and the
`avatar_uploads` bytea table (from spec 021).

**Testing**: Vitest unit, Vitest + PGlite integration, Vitest +
RTL + jsdom component (Constitution v1.10.0 four-layer
pyramid). No E2E this spec — display-only renderer surface, no
crucial journey introduced.

**Target Platform**: PWA (mobile-first 360-wide), Czech-first
copy. Desktop browser secondary.

**Project Type**: Single Next.js App Router project.

**Performance Goals**: First-render parity with current state.
Avatar URLs share the browser cache across surfaces (one
fetch per unique upload version on the page). No new request
on the critical path for members without an upload.

**Constraints**: No layout shift between the avatar-populated
variants and the initials-fallback variant. No regression on
existing row interactions (Confirm / Beru si ho / Undo). No
schema migration.

**Scale/Scope**: 6 rendering sites touched, ~5 query result
shapes extended, 1 component API extension (size variant),
~30 members per club, ~50 rows per surface upper bound.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Tenant-aware DB writes | N/A read-only feature | No writes added; existing queries already carry `club_id`. The avatar URL endpoint (`/api/avatar/[memberId]`) preserves cross-club 404 from spec 021. |
| V. UI reversibility | Pass | Display-only; no destructive interactions added. |
| VI. Czech-first copy | Pass | No new copy. Zero strings added. |
| VIII. Testing Pyramid | See Test layer declaration below. |
| IX. Trunk-based | Pass | Ships direct to main per `feedback-no-prs-trunk-based`. |

### Test layer declaration

- **Unit (`pnpm test:unit`)** — N/A. No new pure functions
  (no Zod schemas, no formatters, no validators). MemberAvatar
  size-variant mapping is a trivial class-name lookup; testing
  it adds noise without value.
- **Integration (`pnpm test:integration`)** — REQUIRED. Each
  extended query needs a regression test that the new
  `memberId / avatarKey / avatarUploadAt` fields are returned
  in the result shape. One spec per extended query
  (~5 specs) keeps each test small and the failure surface
  obvious when something drifts.
- **Component (`pnpm test:component`)** — REQUIRED. Two
  passes: (a) MemberAvatar — new size variants render at the
  right dimensions, fallback chain still works; (b) at least
  one of the most-changed surfaces (the TabEntryRow on-behalf
  attribution path) renders the avatar inline next to the
  existing subtitle.
- **E2E (`pnpm test:e2e`)** — N/A. No crucial journey
  introduced; existing journeys' acceptance criteria are
  unaffected (Confirm / Beru si ho / Undo still work). Per
  Principle VIII's planning-phase decision and the
  `feedback-dev-velocity-priority` rule, no E2E.

## Project Structure

### Documentation (this feature)

```text
specs/023-avatars-everywhere/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — sizing + variant decisions
├── data-model.md        # Phase 1 — no schema, query shape diffs
├── quickstart.md        # Phase 1 — manual walkthrough script
├── contracts/
│   └── member-avatar-size.md   # the MemberAvatar size-variant contract
└── tasks.md             # Phase 2 — /speckit-tasks (not yet created)
```

### Source Code (rendered surfaces)

```text
components/ui/
└── member-avatar.tsx           # ADD `size` prop (3 variants: default, row, inline)

components/treasurer/
├── pending-list.tsx            # MODIFIED: avatar at row size (US1)
└── confirmed-list.tsx          # MODIFIED: avatar at row size (US1)

components/bet/
└── transfer-list.tsx           # MODIFIED: avatar at inline size for both
                                #           drinks-you-can-take + past-bets (US2)

components/tab/
└── tab-entry-row.tsx           # MODIFIED: avatar at inline size on the
                                #           on-behalf subtitle row (US3)

app/[locale]/(app)/history/[sessionId]/
└── page.tsx                    # MODIFIED: avatar at inline size on the
                                #           bet-transfer rows (US4)

lib/db/queries/
├── treasurer.ts                # EXTEND: getPendingClaimsForTreasurer
│                               #         + getRecentlyConfirmedPayments
│                               #         result rows include id + avatar fields
├── bet-transfers.ts            # EXTEND: getTransferableConsumptions...
│                               #         + getBetTransfersForSession
│                               #         result rows include id + avatar fields
└── consumption.ts              # EXTEND: getMyTabForSession result rows
                                #         include loggerMemberId + avatar fields
                                #         on on-behalf entries
                                #         (AND getSessionDetail bet-transfer
                                #         rows for the history surface)
```

```text
tests/integration/
├── pending-claims-avatar-fields.spec.ts        # NEW
├── confirmed-payments-avatar-fields.spec.ts    # NEW
├── bet-transferables-avatar-fields.spec.ts     # NEW
├── bet-transfers-session-avatar-fields.spec.ts # NEW
└── tab-on-behalf-avatar-fields.spec.ts         # NEW

tests/component/
├── member-avatar.spec.tsx                      # EXTEND: new size-variant cases
└── tab-entry-row.spec.tsx                      # EXTEND: on-behalf row with avatar
```

**Structure Decision**: Continue the established beeromat
layout — surface components live in `components/<area>/`,
query layer in `lib/db/queries/`. No new layer added.

## Complexity Tracking

No constitution violations.
