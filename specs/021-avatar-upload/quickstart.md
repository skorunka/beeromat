# Quickstart: Custom Avatar Upload

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

Manual end-to-end walkthrough for the implementer.

## Setup

1. App running locally (`pnpm dev`).
2. Signed in as any member.
3. Migration `drizzle/0009_<name>.sql` applied
   (`pnpm db:migrate` after running `pnpm db:generate`).
4. Two new npm packages installed: `react-image-crop` and
   `browser-image-compression`.

## Walkthrough

### 1. Open the picker

- Tap the avatar circle in the AppHeader (right side).
- Tap "Účet" in the dropdown.
- Scroll to the "Profilová ikona" section. Picker shows the
  Default tile + 8 SVG glyphs (from spec 020) + a NEW
  "Upload" tile (the new affordance from this spec).

### 2. Pick a photo

- Tap the Upload tile. Native file picker opens.
- Pick a JPEG / PNG / WebP file from your device. Anything
  else (PDF, .txt) gets a friendly "must be an image" toast,
  no upload happens.
- Crop UI appears, showing your photo with a circular crop
  region overlaid in the center.

### 3. Crop

- Drag the circle to reposition; drag handles on the corners
  to resize. The crop stays a perfect circle (forced 1:1
  aspect via `react-image-crop`'s `aspect={1}` + `circularCrop`).
- A small preview thumbnail in the corner shows what your
  avatar will look like at h-9 size in the header.
- Tap "Save" / "Uložit". The crop UI closes; the upload
  spinner shows briefly.

### 4. See it propagate

- The picker grid now marks the upload as the current
  selection (Default tile + 8 glyphs unmarked).
- The AppHeader avatar circle now shows your cropped image.
- Navigate to `/admin/balances` (if you have the role). Your
  row shows your cropped image too. Members without uploads
  still show their initials.
- Hard-refresh — image persists.

### 5. Replace

- Open the picker again. Tap Upload, pick a different photo,
  crop, save. The previous image is replaced atomically; the
  header circle updates to the new image on the next render.

### 6. Remove

- Open the picker. Tap any SVG glyph (e.g. beer-mug). The
  upload is dropped from storage; the glyph wins.
- OR: Tap the Default tile. Upload dropped; initials win.

### 7. Inspect the URL

- Open browser DevTools → Network → load any page that renders
  the avatar.
- Find the request to `/api/avatar/<your-member-id>?v=...`.
  Response is `image/jpeg`, status 200, `Cache-Control: public,
  max-age=3600, immutable`. Reload — request hits browser
  cache, no network round-trip.

## Verifications (manual, no automation)

- [ ] Upload of a 4 MB iPhone JPEG succeeds without freezing
      (SC-005). The auto-resize to 512×512 reduces it to
      ~80–120 KB before send.
- [ ] Upload of a non-image (e.g. drag a `.txt`) rejected
      with a friendly toast.
- [ ] After upload, ALL surfaces that use `<MemberAvatar />`
      show the image (today: AppHeader, admin/balances list,
      admin/balances detail, admin/members list).
- [ ] Removing the upload (via glyph or Default) drops the
      bytes from storage AND reveals whatever fallback comes
      next (previously-picked glyph or initials).
- [ ] Cross-club isolation: a member of club A who tries to
      GET `/api/avatar/<club-B-member-id>` gets 404.
- [ ] Czech-first: every new copy (button labels, error
      toasts, crop UI strings if any) reads naturally in
      Czech.

## What good looks like

A member taps Upload → picks a photo → drags to crop → saves
in 5 taps or fewer (SC-001). The avatar circle in the header
updates within one tick. No 500 errors, no page freezes, no
oversized requests. Removing returns to the spec-020 fallback
chain (glyph if previously picked, else initials).
