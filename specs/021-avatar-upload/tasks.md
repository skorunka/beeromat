---
description: "Task list — Custom Avatar Upload (spec 021)"
---

# Tasks: Custom Avatar Upload

**Input**: Design documents from `/specs/021-avatar-upload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/upload-avatar.md, contracts/avatar-route.md, quickstart.md

**Tests**: REQUIRED — plan.md declares unit + integration + component layers per Constitution v1.10.0 Principle VIII.

**Organization**: Tasks grouped by user story (US1/US2 from spec.md, plus a small US3 verification phase and US4 implicit-coverage check). US1 + US2 are tightly coupled — the picker UI delivers both at once, so they share Phase 3.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label on Phase 3+ tasks only
- Paths are repo-root-relative

---

## Phase 1: Setup (Schema + Packages)

**Purpose**: New table, new column, two new npm packages. Blocking — nothing else writes/reads avatar_uploads until this lands.

- [X] T001 Install npm dependencies: `pnpm add react-image-crop browser-image-compression`. Pin to current `latest` per Principle VII; commit the lockfile change.
- [X] T002 Create `lib/db/schema/avatar-uploads.ts` defining the `avatar_uploads` table per data-model.md (id uuid PK, member_id uuid UNIQUE FK → members.id ON DELETE CASCADE, image bytea, content_type text default 'image/jpeg', byte_size integer, created_at + updated_at timestamptz default now()). Export `avatarUploads` + `AvatarUpload` type. Drizzle doesn't export `bytea` for pg — use the `customType` recipe in the data-model.md sketch.
- [X] T003 Add `avatarUploadAt: timestamp('avatar_upload_at', { withTimezone: true })` nullable column to the `members` table in `lib/db/schema/members.ts`. No default.
- [X] T004 Export `avatarUploads` from the Drizzle schema barrel/index (if there is one — verify `lib/db/schema/index.ts` or wherever Drizzle's relational query API discovers tables). Required so `db.query.avatarUploads.findFirst(...)` works.
- [X] T005 Generate the migration: `pnpm db:generate`. Verify the produced `drizzle/0009_<auto>.sql` contains both the CREATE TABLE for avatar_uploads AND the ALTER TABLE members ADD COLUMN. Rename if the auto name is awkward.
- [X] T006 Apply the migration: `pnpm db:migrate`. Verify with `docker exec beeromat-postgres psql -U beeromat -d beeromat -c "\d avatar_uploads"` that the table + UNIQUE constraint exist.

---

## Phase 2: Foundational (Validators + Helpers + i18n)

**Purpose**: Pure utility code + i18n keys that every story depends on. Five tasks can run in parallel; T012 (unit test) depends on T007.

- [X] T007 [P] Create `lib/avatars/upload-validate.ts` exporting `validateAvatarBytes(buf: Uint8Array, contentType: string): { ok: true } | { ok: false; code: 'OVERSIZE' | 'INVALID_CONTENT_TYPE' | 'EMPTY_IMAGE' }`. Const-allowlist of content types: `['image/jpeg', 'image/png', 'image/webp']`. Const max size: `262144` (256 KB).
- [X] T008 [P] Create `lib/avatars/upload-url.ts` exporting `avatarUploadUrl(memberId: string, version: Date | null): string | null`. Returns `null` when version is null; otherwise returns `/api/avatar/{memberId}?v={epochMs}`. The version-as-query-param drives browser cache invalidation when the upload changes.
- [X] T009 [P] Add `account.avatar.upload.*` keys to `messages/cs.json`: at minimum `uploadTileLabel` ("Nahrát"), `cropTitle` ("Ořízni si avatar"), `cropSubtitle` ("Tažením přesuneš, rohy zvětší nebo zmenší"), `saveCta` ("Uložit"), `cancelCta` ("Zrušit"), `errorOversize` ("Obrázek je moc velký. Zkus menší."), `errorInvalidType` ("Vyber prosím obrázek (JPEG, PNG, WebP)."), `errorGeneric` ("Nepovedlo se nahrát. Zkus to znovu."), `removeCta` ("Odstranit nahraný"). No "dlužíš" anywhere.
- [X] T010 [P] Add the same `account.avatar.upload.*` keys to `messages/en.json` with English values. Run `pnpm i18n:check` to verify parity.
- [X] T011 [P] Add `setAvatarAction` clear-upload update to `app/[locale]/(app)/account/actions.ts` per `contracts/upload-avatar.md` "Interaction with spec-020 setAvatarAction": when a glyph or Default is picked, DELETE FROM avatar_uploads + SET members.avatar_upload_at = NULL in the same transaction.
- [X] T012 Unit test `tests/unit/avatar-upload-validate.test.ts` covering `validateAvatarBytes`: (a) accepted content types pass; (b) `application/pdf` rejected with INVALID_CONTENT_TYPE; (c) 300 KB byte buffer rejected with OVERSIZE; (d) empty buffer rejected with EMPTY_IMAGE; (e) zero-length passes content-type but trips EMPTY_IMAGE. Depends on T007.

**Checkpoint**: Schema + validators + i18n + setAvatarAction clear-upload behavior all in place. No user-facing change yet.

---

## Phase 3: User Stories 1 + 2 — Upload + crop (Priority: P1) 🎯 MVP

**Story goal**: Member opens /account, taps Upload, picks a photo, drags the crop circle, saves. Photo replaces their initials in the AppHeader and every other surface that uses MemberAvatar.

**Independent test**: After T013-T021 land, manual quickstart steps 1-5 succeed end-to-end on a fresh member. Refresh / sign out + back in on another device → image persists.

### Server actions + route handler

- [X] T013 [US1] Add `uploadAvatarAction({ imageBase64, contentType })` to `app/[locale]/(app)/account/actions.ts` per `contracts/upload-avatar.md`. requireUnlocked guard; decode base64 with `Buffer.from(input.imageBase64, 'base64')`; validate via `validateAvatarBytes`; UPSERT into avatar_uploads (INSERT ... ON CONFLICT (member_id) DO UPDATE) + UPDATE members SET avatar_upload_at = now() in a single db.transaction. revalidatePath('/', 'layout').
- [X] T014 [US1] Add `removeAvatarUploadAction()` to the same file per `contracts/upload-avatar.md`. requireUnlocked; DELETE FROM avatar_uploads WHERE member_id = ctx.member.id (no-op if missing) + UPDATE members SET avatar_upload_at = NULL in one transaction. revalidatePath('/', 'layout').
- [X] T015 [US1] Integration test `tests/integration/upload-avatar-action.spec.ts` covering all 6 cases in contracts/upload-avatar.md test obligations (happy first upload, replace existing, invalid content-type, oversize, empty image, no-membership). Seed via the standard PGlite + Drizzle harness used by spec-019 tests. Mock next/cache like the others.
- [X] T016 [US1] Integration test `tests/integration/remove-avatar-action.spec.ts` covering 4 cases: happy remove, no-op remove, "picking a glyph also clears upload" (calls setAvatarAction), cascade on member delete.
- [X] T017 [US1] Create Route Handler `app/api/avatar/[memberId]/route.ts` per `contracts/avatar-route.md`. GET handler: requireUnlocked, verify memberId belongs to caller's club (404 cross-club for info-hiding), SELECT image + content_type FROM avatar_uploads, return NextResponse with the bytes + Content-Type + `Cache-Control: public, max-age=3600, immutable`. 404 on no row / invalid UUID.
- [X] T018 [US1] Integration test `tests/integration/avatar-route-handler.spec.ts` covering all 6 cases in contracts/avatar-route.md test obligations (happy, no upload, unknown member, bad UUID, cross-club, cache headers present).

### UI — picker, crop form, renderer

- [X] T019 [US2] Create `components/account/avatar-upload-form.tsx` (client) per quickstart steps 2-3. State machine: idle → file-picked → cropping → saving. Uses `<input type="file" accept="image/jpeg,image/png,image/webp">` for the picker; `react-image-crop` with `circularCrop` + `aspect={1}` for the crop UI; `browser-image-compression` with `{ maxWidthOrHeight: 512, maxSizeMB: 0.2, useWebWorker: true, fileType: 'image/jpeg' }` for the resize. On save: serialize the cropped+compressed Blob → base64 → call `uploadAvatarAction({ imageBase64, contentType: 'image/jpeg' })`. Show beer spinner during upload. Toast errors per i18n keys.
- [X] T020 [US2] Component test `tests/component/avatar-upload-form.spec.tsx`. Mock `uploadAvatarAction` via vi.mock(). Mock `browser-image-compression` to return the input Blob unchanged (so the test doesn't need a canvas). Cases: (a) idle state renders the Upload button; (b) picking a file transitions to crop UI; (c) save calls uploadAvatarAction with base64 + content-type; (d) error response shows error toast; (e) cancel exits crop UI without calling the action.
- [X] T021 [US1+US2] Extend `components/account/avatar-picker.tsx` to render a new Upload tile in the grid. Two visual states: (1) no upload → tile shows an upload icon + "Nahrát"; (2) upload exists → tile shows the current uploaded image with a "ring-2 ring-primary" selection ring. Tapping the tile opens `<AvatarUploadForm />` in a small modal/sheet. After successful upload the form closes + the picker re-renders with the upload as the marked selection.
- [X] T022 [US1] Extend `components/ui/member-avatar.tsx` to accept a new `uploadUrl: string | null` prop. New precedence chain: if uploadUrl → render `<img src={uploadUrl} alt="" className="h-full w-full rounded-full object-cover">` inside the existing amber circle wrapper; else fall through to the existing avatarKey → initials → CircleUser chain. Image's class should fill the wrapper completely.
- [X] T023 [US1] Extend `tests/component/member-avatar.spec.tsx` with a new branch test: when `uploadUrl="/api/avatar/m1?v=123"` is passed, renders an `<img>` with that exact src; valid avatarKey is ignored when uploadUrl is present (uploadUrl wins).

### Wire `uploadUrl` into every existing MemberAvatar call site

Per spec 020 audit + spec 021 dependencies — four surfaces today render `<MemberAvatar />` and need the new prop plumbed through. Each is an independent file edit.

- [X] T024 [P] [US1] AppHeader user-menu trigger: thread `avatarUploadAt` from `ctx.member` through `app/[locale]/(app)/layout.tsx` → `<AppHeader />` → `<UserMenu />`. UserMenu computes `uploadUrl = avatarUploadUrl(memberId, avatarUploadAt)` and passes to `<MemberAvatar />`. New props: `memberId: string` + `avatarUploadAt: Date | null` on AppHeader + UserMenu.
- [X] T025 [P] [US1] /admin/balances list (`app/[locale]/(app)/admin/balances/page.tsx`): extend `getAllMemberBalances` query in `lib/db/queries/payments.ts` to project `members.avatarUploadAt`. Compute uploadUrl per row, pass to `<MemberAvatar />`.
- [X] T026 [P] [US1] /admin/balances/[memberId] detail (`app/[locale]/(app)/admin/balances/[memberId]/page.tsx`): the member object already comes from a direct members.findFirst — passes `avatarUploadAt` through; compute uploadUrl, pass to the header `<MemberAvatar />`.
- [X] T027 [P] [US1] /admin/members list (`app/[locale]/(app)/admin/members/page.tsx`): direct members SELECT already returns all columns including the new `avatarUploadAt`. Compute uploadUrl per row, pass to `<MemberAvatar />`.

**Checkpoint US1+US2 complete**: full upload + crop + save + render works end-to-end. Member can upload, picker shows the upload as selected, AppHeader + all 3 admin surfaces show the image.

---

## Phase 4: User Story 3 — Guardrails (Priority: P2)

**Story goal**: Large iPhone JPEGs upload without crashing; non-image files rejected with a friendly message; animated GIFs become static.

**Independent test**: After T028 lands, picking a 5 MB image succeeds (auto-resized client-side); picking a PDF shows the "must be image" toast; picking an animated GIF stores only the first frame as static JPEG.

- [X] T028 [US3] Verification + small additions to `components/account/avatar-upload-form.tsx`:
  (a) confirm the `<input accept>` attribute filters non-images at the OS file picker level (most platforms honor it; verify by trying `.txt`);
  (b) confirm `browser-image-compression`'s output is JPEG regardless of input format (the `fileType: 'image/jpeg'` config forces it — animated GIFs collapse to the first frame as a side-effect of canvas re-encoding to JPEG);
  (c) add a client-side double-check on the picked File's `.type` against the same allowlist as `lib/avatars/upload-validate.ts`, showing the i18n `errorInvalidType` toast if a sneaky file slips past the OS picker;
  (d) confirm the server-side `OVERSIZE` path from T013 returns the `errorOversize` toast cleanly (the client-side resize should make this never fire, but the fallback should render OK).

(T028 is mostly verification — most of US3 falls out for free from US1/US2 implementation choices.)

---

## Phase 5: User Story 4 — Remove (Priority: P2)

**Story goal**: Member can remove their uploaded avatar — either by picking a glyph (clears upload, glyph wins), picking the Default tile (clears upload, initials win), OR an explicit Remove affordance.

**Independent test**: After T029 lands, all three remove paths work AND drop the bytes from storage (verify via integration test from T016).

- [X] T029 [US4] Verify in the picker (T021) that an explicit "Remove uploaded" affordance is reachable — could be a contextual button shown only when an upload is the current selection (e.g. an "✕" badge on the upload tile, or a "Odstranit" link under the tile). Wire to `removeAvatarUploadAction()`. If T021 already exposed it as part of normal picker behavior (picking any glyph or Default also clears), this can be a no-op + a note in the picker comment.

---

## Phase 6: Polish & Cross-Cutting

- [X] T030 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass.
- [X] T031 Update `BACKLOG.md` — add a "Shipped 2026-05-27 as spec 021" strikethrough for the avatar-upload work (no existing backlog item for upload specifically — but cross-reference the spec-020 follow-up note about extending MemberAvatar surfaces if needed).
- [X] T032 Update `CLAUDE.md` SPECKIT marker — move spec 021 from "in flight" to "most recent shipped".
- [X] T033 Mark `spec.md` status `Shipped (2026-05-27)`. Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 1 (T001 → T002 → T003 → T004 → T005 → T006)
   ↓
Phase 2 — T007 [P], T008 [P], T009 [P], T010 [P], T011 [P]; then T012 (depends on T007)
   ↓
Phase 3 server side — T013, T014 (sequential — same file); then T015, T016 [P]; T017 (independent); then T018
Phase 3 UI side — T019; then T020 (depends on T019); T022 (independent component); then T023
Phase 3 wiring — T021 (depends on T013-T014 + T019); T024-T027 [P] (depends on T022 + T008)
   ↓
Phase 4 (T028 — depends on T019 + T013)
   ↓
Phase 5 (T029 — depends on T021 + T014)
   ↓
Phase 6 (T030 → T031 → T032 → T033)
```

## Parallel Execution Examples

**Within Phase 2** (foundational scaffolding):
```
T007 (upload-validate.ts) ┐
T008 (upload-url.ts)       ├─ all 5 land in parallel, different files
T009 (cs.json)             │
T010 (en.json)             │
T011 (setAvatarAction edit)┘
```
Then sequentially: T012 (unit test for the validator).

**Within Phase 3 — wiring sites for `uploadUrl`** (independent surfaces):
```
T024 (AppHeader / UserMenu)              ┐
T025 (admin/balances list + query update) ├─ all 4 in parallel
T026 (admin/balances/[memberId])          │
T027 (admin/members list)                 ┘
```

## Implementation Strategy

**MVP scope = Phase 1 + Phase 2 + Phase 3 (US1+US2).** After MVP, members can upload + crop + save + see their photo in the AppHeader + all 3 admin surfaces; the spec-020 fallback chain still works for members who never upload.

**Full v1 = MVP + Phase 4 (US3) + Phase 5 (US4) + Phase 6 (Polish).** Phase 4 is mostly verification; Phase 5 is mostly verification; the heavy lifting is in Phase 3.

**Smallest shippable demo = Phases 1 + 2 + T013/T014/T017 (server side) + T019/T022 (basic UI without picker integration).** Skips the picker tile + UI polish; lets you verify the upload → DB → render pipeline end-to-end before committing to the full UX work in T021/T024-T027.
