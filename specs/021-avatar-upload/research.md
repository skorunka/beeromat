# Research: Custom Avatar Upload

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All three open design decisions resolved during `/speckit-clarify`.
This file records the rationale + alternatives evaluated, in the
shape `/speckit-plan` Phase 0 expects.

## Decision: separate `avatar_uploads` table

**Decision**: Image bytes live in a new `avatar_uploads` table
with a one-to-one FK to `members.id` (cascade on delete). A
nullable `members.avatar_upload_at timestamptz` column doubles
as the "has an upload?" sentinel and the cache-buster query
param on the image URL.

**Rationale**:
- Existing queries (admin/balances list, /tab joins, balances
  aggregation) use Drizzle's `db.query.members.findFirst({...})`
  pattern which selects ALL columns by default. Inlining a
  ~150 KB bytea column on `members` would bloat every default
  member fetch app-wide.
- A separate table isolates the image to render-time fetches
  only. The `avatar_upload_at` sentinel column is tiny (8
  bytes) and is the only thing the renderer needs to decide
  "upload? glyph? initials?".
- Multi-club future stays unblocked: spec 020 stored avatars
  per club seat, and uploads follow the same convention via
  the members FK.

**Alternatives considered**:
- *Inline `members.avatar_image bytea` + `avatar_content_type text`*:
  rejected (per clarify Q1) — bloats every default member SELECT.
- *Store on `users` (cross-club identity)*: rejected — inverts
  the per-club-seat convention spec 020 already established.
- *External blob store (S3-compatible) with `members.avatar_url`
  text*: out of scope for v1. The user direction explicitly said
  "store into db." Can migrate later by adding an `external_url`
  column to `avatar_uploads` and porting bytes incrementally.

## Decision: client-side auto-resize via browser-image-compression

**Decision**: Every picked image is resized to 512×512 px JPEG
at quality 0.85 in the browser BEFORE upload, using the
`browser-image-compression` package. Server-side hard ceiling of
256 KB rejects anything that slips through (bypassed client,
manual API call).

**Rationale**:
- iPhone default-quality photos are 3-5 MB; Android equivalents
  are similar. Hard-rejecting these (Option B from clarify)
  means every iPhone member gets a "too large" error every time
  they pick a photo, with no recourse on a phone.
- 512×512 is enough for an avatar at any size the app ever
  renders (max h-12 = 48px, retina = 96px). JPEG quality 0.85
  is the sweet spot — visually indistinguishable from quality
  1.0 at small sizes, ~30% smaller payload.
- Client-side resize means the upload request is always small
  (~50-150 KB) regardless of source. Bandwidth + server CPU
  + database storage all stay bounded.
- The 256 KB server ceiling is defense-in-depth: it's 2× the
  expected payload (~150 KB at q=0.85) — generous enough to
  never fire on legitimate uploads, tight enough to reject
  obvious abuse.

**Alternatives considered**:
- *Hard-reject above a cap, no client resize*: rejected (clarify
  Q2) — bad mobile UX.
- *Server-side resize (e.g. via sharp on the route handler)*:
  rejected — adds a heavyweight native dep (sharp ships with
  ~50 MB of Linux binaries) for negligible benefit over
  client-side. Also requires shipping the raw multi-MB blob
  over the wire just to throw most of it away.
- *Hybrid (client resize + server-side fallback if too big)*:
  unnecessary. Client resize is reliable; the server ceiling is
  the fallback.

## Decision: react-image-crop + browser-image-compression

**Decision**: Two npm packages for the upload pipeline.
- `react-image-crop` for the crop UI — built-in `circularCrop`
  prop renders the preview with a circular mask matching the
  avatar surface. Touch-friendly drag + resize handles.
  Forced 1:1 aspect ratio via the `aspect` prop.
- `browser-image-compression` for the resize step — single
  async function takes a File, returns a smaller File.
  Configurable max width/height + quality.

**Rationale**:
- `react-image-crop` is the de-facto crop UI for React (~3M
  weekly downloads on npm at time of writing). Stable API,
  accessible, ships with the `circularCrop` feature this spec
  explicitly needs.
- `browser-image-compression` is the natural pairing — uses
  the browser's built-in canvas + Web Workers for the resize,
  no native deps, ~15 KB minified.
- Both packages are pinned to current `latest` per Principle
  VII (Fresh Code Hygiene).
- Combined bundle cost: ~40 KB minified added to the /account
  route — acceptable since the picker is only loaded when
  members visit /account.

**Alternatives considered**:
- *`react-easy-crop`* (more polished pan/zoom UX) — rejected.
  Slightly heavier, default UX is fancier than we need for
  "crop a square photo."
- *`react-avatar-editor`* (single package, crop + resize
  bundled) — rejected. Older API, smaller community, less
  flexible. Better to keep the two concerns (crop UI vs
  compression) separate so we can swap either independently.
- *Roll our own canvas-based cropper* — out of the question;
  reinventing well-solved touch-handle drag/resize for an
  internal pet-app feature is the wrong tradeoff.

## Pattern reuse from prior specs

- **Spec 020 `<MemberAvatar />` renderer** — adding one new
  branch (uploadUrl → `<img>`) at the top of the existing
  fallback chain. Doesn't break the spec-020 contract; surfaces
  that don't pass `uploadUrl` see the existing glyph/initials
  behavior unchanged.
- **Spec 020 `members.avatar_key`** — stays untouched. When an
  upload is set (`avatar_upload_at IS NOT NULL`), the renderer
  prefers the upload; `avatar_key` is the runner-up. This means
  removing an upload reveals whatever glyph the member previously
  picked — a small UX win (no need to re-pick).
- **Spec 019 `setAvatarAction` discriminated-union pattern** —
  applies directly to `uploadAvatarAction` and
  `removeAvatarUploadAction`. Same `{ ok: true } | { ok: false;
  code: ... }` shape.
- **Spec 020 component test patterns** — `vi.mock()` for the
  server action, NextIntlClientProvider wrapper for i18n.
  Direct template for `avatar-upload-form.spec.tsx`.

## Open notes for implementation

- The Drizzle schema's `bytea` type maps to `Uint8Array` in
  TypeScript — straightforward.
- Server actions need careful handling for `Buffer` ↔
  `Uint8Array`. The `Buffer.from(base64, 'base64')` produces a
  Node Buffer which is itself a Uint8Array — passes Drizzle's
  bytea bindings directly.
- The Route Handler must set `Content-Type` from the stored
  column AND `Cache-Control: public, max-age=3600, immutable`
  (immutable because the URL carries the version query param;
  any change to the upload changes the URL).
- Initial implementation can skip the `ETag` header — the
  query param cache-busting already covers the dirty-cache case.
  Can add ETag later if real usage shows it'd help.
