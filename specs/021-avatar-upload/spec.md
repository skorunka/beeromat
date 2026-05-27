# Feature Specification: Custom Avatar Upload

**Feature Branch**: `021-avatar-upload`

**Created**: 2026-05-27

**Status**: Shipped (2026-05-27)

**Input**: User description: extend the spec-020 avatar picker so a
member can upload their own image (face photo, club logo, anything
they want) instead of being limited to the 8 predefined glyphs.
Store in the database. Get inspired by existing npm packages on the
web.

## Clarifications

### Session 2026-05-27

- Q: Where do the uploaded image bytes sit in the schema? → A:
  Option B — separate `avatar_uploads` table with FK to
  `members.id`, one-to-one, cascade on delete. Keeps existing
  `members` SELECTs lean; bytes only loaded when needed.
- Q: How do we keep upload size bounded? → A: Option A —
  client-side auto-resize to a fixed target (512×512 px, JPEG
  quality 0.85) before upload. Any reasonable source photo
  ends up as ~50–150 KB; the server only ever sees the
  resized blob.
- Q: Which npm packages for crop UI + client-side resize?
  → A: Option A — `react-image-crop` + `browser-image-compression`.
  Crop preview MUST render with a circular mask (matching the
  avatar surface, which is always a circle) — `react-image-crop`
  supports this natively via its `circularCrop` prop. Underlying
  saved bytes are still a 512×512 JPEG square (the circle is a
  CSS clip at render time), so future surfaces that render the
  avatar at a different shape stay flexible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Member uploads a photo (Priority: P1)

Tereza opens `/account`, taps an "Upload" affordance in the avatar
section, picks a photo from her phone's camera roll, crops it
square in the browser, and saves. Her avatar in the AppHeader
immediately shows the uploaded image. Reload, sign out / sign in
on another device — the image persists.

**Why this priority**: This is the primary feature. Spec 020 gave
members 8 stock glyphs; the upload makes the avatar genuinely
*theirs*. The whole spec exists to deliver this.

**Independent Test**: Member visits /account, uses the upload
affordance, picks an image, crops, saves. The header avatar circle
shows the cropped image (not initials, not a glyph). Hard-refresh
the page; image still there.

**Acceptance Scenarios**:

1. **Given** a member who has never set an avatar, **When** they
   tap "Upload" and pick a JPEG from their device, **Then** the
   image is uploaded, stored, and rendered in the header circle
   on the next render tick.
2. **Given** a member with a previously-picked SVG glyph, **When**
   they upload a photo, **Then** the photo replaces the glyph
   everywhere the avatar renders.
3. **Given** a member with an uploaded photo, **When** they pick
   one of the 8 predefined glyphs from spec 020, **Then** the
   glyph replaces the photo and the photo bytes are dropped from
   storage.
4. **Given** a member with an uploaded photo, **When** they tap
   the "Default (initials)" tile, **Then** the photo is dropped
   from storage and the initials fallback returns everywhere.

---

### User Story 2 - Square-crop before upload (Priority: P1)

The avatar surface is a circle of fixed proportions. A member's
phone photo is almost never square, so the upload flow MUST let
the member crop a square region before committing — otherwise the
header circle would either letterbox the image or arbitrarily
slice off heads.

**Why this priority**: Without crop, every upload is a roulette
of how the renderer happens to crop. Members will hate it.

**Independent Test**: A member uploads a portrait photo (taller
than wide). The crop UI defaults to a centered square selection.
The member can drag/resize the square. On save, only the cropped
region is uploaded; the saved avatar matches the crop preview.

**Acceptance Scenarios**:

1. **Given** an uploaded portrait photo, **When** the crop UI
   opens, **Then** a square crop region is overlaid on the photo
   with sensible default position + size.
2. **Given** the crop UI is open, **When** the member drags or
   resizes the crop region, **Then** the preview thumbnail
   (matching what will appear in the header circle) updates live.
3. **Given** the crop region is set, **When** the member taps
   Save, **Then** only the cropped square is sent to the server.
   The original full image bytes never reach the database.

---

### User Story 3 - Upload size + format guardrails (Priority: P2)

A member tries to upload a 40 MB ProRAW photo from their iPhone.
The flow MUST either reject it cleanly with a helpful message OR
client-side-resize it to a sensible upload size before sending.

**Why this priority**: P2 because the happy path is the small-
image case; this is the "didn't crash on a 50 MB upload" case.
But without it the feature breaks for iPhone users with default
camera settings.

**Independent Test**: A member picks a large image (>10 MB). The
flow either rejects with a clear message OR silently downsamples
to a target dimension (e.g. 512×512) before uploading. Either
way: the request size stays bounded, the page doesn't freeze, no
500 error.

**Acceptance Scenarios**:

1. **Given** a member picks a 25 MB image, **When** the client
   inspects it before upload, **Then** the image is either
   resized client-side to fit within an upload-size budget OR
   the upload is refused with a friendly "image too large" toast.
   No 500 / 413 / Drizzle error reaches the server.
2. **Given** a member picks a file that isn't an image (PDF,
   .txt, etc.), **When** the client validates the type, **Then**
   the upload is refused with a "must be an image" message.
3. **Given** a member uploads an animated GIF, **When** the
   server processes it, **Then** only the first frame is stored
   (the avatar is always static — no animation in the circle).

---

### User Story 4 - Remove uploaded avatar (Priority: P2)

After uploading, the member changes their mind. They want their
initials back (or want to pick one of the spec-020 glyphs
instead). Removing the upload MUST be discoverable from the same
picker UI.

**Why this priority**: Covered by acceptance scenarios 3 + 4 of
US1; called out as its own story so the UI explicitly exposes
the "remove upload" affordance (vs leaving it as an implicit
side-effect of picking a glyph).

**Independent Test**: Member uploaded a photo. They open the
picker. The picker shows their current upload as the marked
selection. They tap the "Default" tile (or any of the 8 glyphs).
The upload is removed, both visually and from storage.

**Acceptance Scenarios**:

1. **Given** a member has an uploaded avatar, **When** they open
   the picker, **Then** the upload is visually indicated as the
   current selection (in addition to the 8 glyphs + Default).
2. **Given** an uploaded avatar is the current selection, **When**
   the member picks any other option (glyph or Default), **Then**
   the upload is removed from storage AND from every render
   surface.

---

### Edge Cases

- **Cross-club avatars (multi-club future)**: spec 020 stored the
  avatar key per club seat (`members.avatar_key`). The uploaded
  image must follow the same per-club convention — a member in
  two clubs uploads independently in each. Storage layout
  decision (per-member or per-user) is a planning-time question;
  spec just says "the upload is per-club seat" to keep behavior
  consistent with spec 020.
- **Member with a stored upload that exceeds a future size
  limit**: e.g. v1 allows 200 KB, v2 lowers to 100 KB. The
  renderer keeps serving the existing larger image until the
  member next changes it; the size cap only applies on write.
  Past uploads are never invalidated retroactively.
- **Member uploads + simultaneous picker selection (race)**: a
  member opens the picker on two devices. On device A they
  upload a photo; on device B they tap a glyph. Last write wins,
  same as spec 020 — both devices reflect the final state on
  next render.
- **Network failure mid-upload**: the upload posts the cropped
  bytes; if the server returns 500 or the request times out, the
  picker shows an error toast + the previous selection (glyph,
  default, or older upload) stays in place — no partial state.
- **Image with no faces / EXIF orientation drama / HEIC from
  iOS**: the cropping UI sees what the browser shows, which
  handles EXIF orientation natively for JPEGs. HEIC support is
  patchier — the client should detect unsupported formats and
  ask the member to pick a different file rather than silently
  failing.
- **Reduced motion**: any crop-UI transitions must respect
  `prefers-reduced-motion` (skip animations, snap instantly).
- **Empty club catalog change**: irrelevant to this spec — the
  upload feature is decoupled from the beer catalog.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The avatar picker (introduced in spec 020) MUST
  gain an "Upload" affordance that lets a member pick an image
  file from their device.

- **FR-002**: After the member picks a file, the system MUST
  show a crop UI that constrains the crop region to a 1:1
  square aspect ratio AND renders the crop preview with a
  circular mask matching the avatar surface (per Clarifications
  2026-05-27 — Option A: `circularCrop` prop on
  `react-image-crop`). The member MUST be able to reposition
  and resize the crop region before committing. Underlying
  saved bytes remain a square JPEG; the circle is applied at
  render time so future non-circular surfaces stay flexible.

- **FR-003**: The system MUST send only the cropped portion of
  the image (not the full original) to the server. Pre-crop
  bytes never reach the database.

- **FR-004**: The client MUST auto-resize every picked image to
  a fixed 512×512 px target at JPEG quality 0.85 before sending
  it to the server (per Clarifications 2026-05-27 — Option A).
  This guarantees the request payload stays ≤ ~200 KB regardless
  of source dimensions. The server MUST also enforce a hard
  ceiling (e.g. 256 KB) as defense-in-depth against bypassed or
  buggy clients.

- **FR-005**: The system MUST accept common web-image formats
  (JPEG, PNG, WebP) and reject non-image files (PDF, plain
  text, etc.) with a clear error message.

- **FR-006**: A member MUST be able to remove their uploaded
  avatar via the picker — either by picking one of the spec-020
  glyphs, picking the Default (initials) tile, or via a dedicated
  remove affordance. Removal MUST drop the image bytes from
  storage.

- **FR-007**: An uploaded avatar MUST render wherever the
  `<MemberAvatar />` renderer currently shows an avatar (today:
  AppHeader user-menu trigger + /admin/balances list + /admin/
  balances/[memberId] header + /admin/members list — per the
  spec 020 audit). The renderer's fallback chain becomes:
  uploaded image → SVG glyph → initials → CircleUser icon.

- **FR-008**: An uploaded avatar MUST persist across sessions
  and devices (a member uploads on phone, sees the avatar on
  desktop without re-uploading).

- **FR-009**: Image bytes MUST be stored in a separate
  `avatar_uploads` table with a one-to-one FK to `members.id`
  (per Clarifications 2026-05-27 — Option B). Cascade on
  member delete. Existing `members` SELECTs MUST NOT pull the
  image bytes by default; the renderer fetches them only when
  it needs them.

- **FR-010**: The uploaded image MUST be served with appropriate
  cache headers so the AppHeader avatar doesn't re-download the
  same bytes on every page navigation.

- **FR-011**: Animated formats (GIF, animated WebP) MUST render
  as a static still — only the first frame survives. No
  animation in the avatar circle.

### Key Entities *(include if feature involves data)*

- **Member avatar selection** (extended from spec 020): now
  carries one of three mutually-exclusive states — (a) NULL =
  "use default (initials/icon)"; (b) one of `AVATAR_KEYS`
  strings = "use the matching SVG glyph"; (c) reference to an
  uploaded image = "use the uploaded photo". The shape of (c)
  in storage is a planning decision (bytes inline vs id pointing
  at a separate row); the user-facing behavior is that exactly
  one of the three states is active at a time.

- **Uploaded avatar image**: lives in a dedicated
  `avatar_uploads` table (Clarifications 2026-05-27 → Option B).
  Fields: FK to `members.id` (unique — one upload per member
  seat), binary blob, content-type string, upload timestamp.
  Lifecycle: created on upload, replaced on re-upload, deleted
  on remove (cascades on member deletion). Bytes are the
  cropped square, not the original.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can complete the full upload + crop +
  save flow in 5 taps or fewer (open picker → pick "Upload" →
  pick file → confirm crop → save).

- **SC-002**: An uploaded avatar renders on the next render
  tick wherever `<MemberAvatar />` is used — no stale glyphs
  or initials remain on any visible surface.

- **SC-003**: No single stored avatar exceeds 256 KB
  (Clarifications 2026-05-27 → server-side ceiling; client
  resize to 512×512 JPEG 0.85 produces ~50–150 KB in practice).

- **SC-004**: Glyph rendering quality is high enough that
  members reading the AppHeader at 36×36 pixels can recognize
  their own uploaded face/logo without zooming in.

- **SC-005**: An iPhone member with default-quality camera
  photos (3-5 MB JPEGs) can upload without the page freezing,
  the upload failing, or the server returning a 5xx.

- **SC-006**: Removing an uploaded avatar (whether via picking
  a glyph or the Default tile) drops the bytes from storage
  on the same tick — no orphaned image rows.

## Assumptions

- The spec 020 picker is the canonical place to add the upload
  affordance — no separate "upload" surface needed elsewhere.
- The avatar surface is always a circle of fixed proportions
  (h-9 w-9 in the AppHeader, h-10/h-12 in admin lists). The
  crop UI mirrors this constraint by forcing a square aspect
  ratio.
- Members upload from a mobile browser most often. The crop UI
  must work with touch input (drag, pinch-resize) — not just
  mouse.
- The picked file is processed entirely client-side before
  upload (crop, resize, compress). The server only receives the
  final bytes to store. This keeps the server simple and bounds
  the bandwidth.
- Image storage in the database (per user direction) is
  acceptable for the project's scale — small clubs, ~50 members
  each, ~200 KB per avatar = ~10 MB per club total, well within
  Postgres / Neon's comfort zone. If multi-tenant scale changes
  this assumption later, the schema can be migrated to a
  blob-store reference without breaking the renderer API.
- No image moderation pipeline (NSFW detection, etc.) for v1.
  The pet-app trust model is "if a member uploads something
  inappropriate, the treasurer asks them to change it."
- Existing client-side npm packages can be used to handle the
  crop UI + client-side resize (`react-image-crop` for crop,
  `browser-image-compression` for resize, or similar). The
  planning phase picks the specific packages; the user
  direction explicitly called out "get inspired on the web."
- The audit trail for avatar changes is out of scope (per
  spec 020 Assumptions). The uploaded image is low-stakes
  personal customization; no event-log entry needed.

## Dependencies

- Spec 020 (Fun avatar picker) MUST be shipped first. This spec
  extends the picker UI and the `members.avatar_key` storage
  pattern.

- The `<MemberAvatar />` renderer from spec 020 (already
  rolled out to admin lists + AppHeader) gains a new render
  branch for the uploaded-image case. Future surfaces that
  adopt `<MemberAvatar />` pick up uploaded avatars
  automatically.
