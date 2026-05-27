# Implementation Plan: Custom Avatar Upload

**Branch**: `main` (trunk per `feedback-no-prs-trunk-based`) | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-avatar-upload/spec.md`

## Summary

Extend the spec-020 avatar picker so a member can upload their own
image. Client picks a file → resizes to 512×512 JPEG (quality 0.85)
via `browser-image-compression` → crops with `react-image-crop`
(circular mask, 1:1 ratio) → posts the final ~50-150 KB blob to a
server action. Bytes land in a new `avatar_uploads` table
(one-to-one FK to `members`, cascade on delete). A nullable
`members.avatar_upload_at` timestamp doubles as the "has upload?"
sentinel + the cache-buster query param. A new GET
`/api/avatar/[memberId]` Route Handler streams the bytes with
proper Cache-Control. The existing `<MemberAvatar />` renderer
(spec 020) gets a new top branch: when `uploadUrl` is provided,
render `<img>`; otherwise fall through to glyph → initials → icon.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict).

**Primary Dependencies**:
- Existing: Next.js 16 (App Router + Server Actions + Route
  Handlers), Drizzle ORM 0.45.x, next-intl 4.x, Tailwind 4,
  shadcn/ui, lucide-react.
- New (per clarify Q3): `react-image-crop` ~25 KB (crop UI with
  built-in `circularCrop` mask) + `browser-image-compression`
  ~15 KB (client-side resize/compression). Both stable,
  well-maintained, zero peer dependencies.

**Storage**:
- New table `avatar_uploads` (Postgres bytea, one-to-one FK to
  `members.id`, cascade delete).
- One new column `members.avatar_upload_at timestamptz NULL`.

**Testing**: Vitest pyramid per Constitution v1.10.0 — unit for
the pure image-byte size validator, integration for the
upload/remove server actions + the Route Handler bytes path,
component for the upload+crop form + the renderer's new branch.

**Target Platform**: PWA — mobile browsers primary (touch crop +
camera-roll pick), desktop browsers supported.

**Project Type**: Single Next.js app (no monorepo).

**Performance Goals**:
- Upload Server Action round-trip ≤ 2 s on a mid-tier 4G phone
  for a 100 KB blob (the SC-005 user-perceived bar).
- Image GET from `/api/avatar/[memberId]` ≤ 100 ms cold and
  served from browser cache thereafter (Cache-Control +
  ETag headers).
- Server-side hard ceiling: reject any incoming blob > 256 KB
  with a 413, even though the client always sends ~150 KB or
  less — defense in depth.

**Constraints**:
- Czech-first copy; no "dlužíš" (n/a here but rule applies).
- Inline-SVG glyphs from spec 020 remain the cheap default;
  uploads are opt-in.
- Avatar surface is always a circle (h-9 → h-12) — the crop
  preview MUST show a circular mask matching what the renderer
  will display.
- Server actions in Next 16 accept FormData OR JSON. Plan uses
  JSON with a base64-encoded body for simplicity (no
  multipart-handling middleware needed); 150 KB base64-encoded
  is ~200 KB request body, well within the default Next.js
  Server Action limit.

**Scale/Scope**: ~50 members per club × ~200 KB per stored
avatar = ~10 MB per club. Comfortable in Postgres bytea; well
under Neon's per-row limits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design. Constitution v1.10.0.*

- **I. Mobile-First PWA** ✓ — entire flow works in a mobile
  browser; touch-friendly crop UI; one-thumb capable.
- **II. Tenant-Aware Schema** ✓ — `avatar_uploads.member_id`
  references `members.id`, which already carries `club_id`. No
  cross-club leakage possible.
- **III. Track, Don't Transact** ✓ — N/A, no money path.
- **IV. Auditable History** ✓ — uploads are low-stakes personal
  customization; per spec Assumptions, no event-log entry
  needed. Same as spec 020.
- **V. UI Reversibility** ✓ — FR-006 + US4 require a "remove
  upload" path; the picker exposes it via "Default" tile +
  picking any glyph.
- **VI. Czech-First Copy** ✓ — picker copy + error toasts go
  into both catalogs.
- **VII. Fresh Code Hygiene** ✓ — two new packages, both
  pinned to current `latest`.
- **VIII. Testing Pyramid** ✓ — see declaration below.
- **IX. Trunk-Based** ✓ — ship straight to main.

### Test layer declaration

*Required by Principle VIII (Constitution v1.10.0 four-layer
pyramid).*

- **Unit (`pnpm test:unit`)** — YES. Pure functions:
  (a) `validateAvatarBytes(buf, contentType)` — checks size cap
  + accepted content-type allowlist; (b) base64 decode helper
  for the action input. File:
  `tests/unit/avatar-upload-validate.test.ts`.

- **Integration (`pnpm test:integration`)** — YES. DB-coupled
  server actions:
  • `tests/integration/upload-avatar-action.spec.ts` — happy
    upload path, replace-on-re-upload, invalid content-type
    rejected, oversize rejected, no-membership rejected.
  • `tests/integration/remove-avatar-action.spec.ts` — clears
    `members.avatar_upload_at` AND the `avatar_uploads` row;
    cascade on member delete.

- **Component (`pnpm test:component`)** — YES. Two new tests:
  • `tests/component/avatar-upload-form.spec.tsx` — file
    picker triggers crop UI; circular preview mask shown;
    submit calls (mocked) server action with the right shape.
  • Extend `tests/component/member-avatar.spec.tsx` — new
    branch: when `uploadUrl` is provided, renders `<img>` with
    that src instead of the glyph/initials fallback.

- **E2E (`pnpm test:e2e`)** — NO. Same rationale as spec 020:
  no money path, no multi-step coordination, no concurrent-
  actor risk. The crop step happens in a browser-only library;
  exercising it under Playwright would be high-effort low-
  value. All observable behaviour is covered by the layers
  above.

## Project Structure

### Documentation (this feature)

```text
specs/021-avatar-upload/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/
│   ├── upload-avatar.md       # Server action contract
│   └── avatar-route.md        # GET /api/avatar/[memberId] contract
├── checklists/
│   └── requirements.md        # /speckit-specify output (all pass)
└── tasks.md                   # /speckit-tasks output (next phase)
```

### Source Code (repository root)

```text
app/
├── [locale]/(app)/account/
│   ├── actions.ts             # +uploadAvatarAction, +removeAvatarUploadAction
│   ├── page.tsx               # no change (picker already renders here)
│   └── ...
└── api/
    └── avatar/
        └── [memberId]/
            └── route.ts       # NEW — GET handler that streams bytes

components/
├── account/
│   ├── avatar-picker.tsx      # extend — add "Upload" tile + state
│   └── avatar-upload-form.tsx # NEW — file picker + crop UI + submit
└── ui/
    └── member-avatar.tsx      # extend — new uploadUrl branch

lib/
├── avatars/
│   ├── palette.tsx            # unchanged (spec 020)
│   ├── validate.ts            # unchanged
│   ├── upload-validate.ts     # NEW — server-side byte validators
│   ├── upload-url.ts          # NEW — helper that builds /api/avatar/x?v=t
│   └── initials.ts            # unchanged
└── db/
    └── schema/
        ├── members.ts         # +avatar_upload_at timestamptz NULL
        └── avatar-uploads.ts  # NEW — table definition

drizzle/
└── 0009_<name>.sql            # NEW — CREATE TABLE + ALTER members ADD COLUMN

messages/
├── cs.json                    # +account.avatar.upload.* keys
└── en.json                    # +account.avatar.upload.* keys

tests/
├── unit/
│   └── avatar-upload-validate.test.ts
├── integration/
│   ├── upload-avatar-action.spec.ts
│   └── remove-avatar-action.spec.ts
└── component/
    ├── avatar-upload-form.spec.tsx
    └── member-avatar.spec.tsx # extend (existing file)
```

**Structure Decision**: Single Next.js application. The Route
Handler under `app/api/avatar/[memberId]/route.ts` follows the
existing convention for project endpoints; this is the first
non-action route for binary serving — sets the pattern for
future ones (e.g. exported PDFs).

## Complexity Tracking

> No Constitution Check violations. The new bytea storage + image
> serving endpoint are the most novel parts; both are bounded in
> scope and well-supported by the existing Drizzle + Next.js
> primitives. Two npm packages added, both popular + small.
