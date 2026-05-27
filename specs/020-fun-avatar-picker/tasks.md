---
description: "Task list — Fun Avatar Picker (spec 020)"
---

# Tasks: Fun Avatar Picker

**Input**: Design documents from `/specs/020-fun-avatar-picker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/set-avatar.md, quickstart.md

**Tests**: REQUIRED — plan.md declares unit + integration + component layers per Constitution v1.10.0 Principle VIII.

**Organization**: Tasks grouped by user story (US1 / US2 / US3 from spec.md). MVP = Phase 1 + Phase 2 + Phase 3 (US1). US2 and US3 layer on after MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3) — only on Phase 3+ tasks
- Include exact file paths in descriptions

## Path Conventions

Single Next.js project; paths are repo-root-relative. See `plan.md` → Source Code for the full layout.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema change + migration. Blocking — nothing else writes / reads `avatar_key` until this lands.

- [X] T001 Add `avatarKey: text('avatar_key')` nullable column to the `members` table definition in `lib/db/schema/members.ts`. No constraints, no default, no index. Matches data-model.md.
- [X] T002 Generate the Drizzle migration via `pnpm drizzle-kit generate`; verify the produced file under `drizzle/` is named `0008_<auto>.sql` and contains only `ALTER TABLE "members" ADD COLUMN "avatar_key" text;`. Hand-rename if the auto name is awkward.
- [X] T003 Apply the migration locally with `pnpm db:push` (or the project's standard apply script) and verify the column exists by running `\d members` in the local Postgres / PGlite.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Palette, validator, initials helper, and i18n keys. Every user story depends on these existing. Five of the six tasks can run in parallel; T009 (the unit test) depends on T004 + T005.

- [X] T004 [P] Create `lib/avatars/palette.tsx` exporting `AVATAR_KEYS` (readonly tuple of 12 string keys per data-model.md), the `AvatarKey` type, and a `FLAGS`-style `GLYPHS` record mapping each key to `{ viewBox, body }` inline-SVG content. Glyph set: beer-mug, tennis-ball, court, cheers, wine, trophy, medal, bee, lion, lightning, target, guitar. Mirror the structure of `components/ui/flag-icon.tsx`.
- [X] T005 [P] Create `lib/avatars/validate.ts` exporting `isValidAvatarKey(s: string): s is AvatarKey`. Pure function over the frozen `AVATAR_KEYS` set imported from `lib/avatars/palette.tsx`.
- [X] T006 [P] Extract the `initials(name)` function currently defined inline in `components/nav/user-menu.tsx` (lines ~37-42) into `lib/avatars/initials.ts`. Update `user-menu.tsx` to import from the new location. No behaviour change — pure refactor so the new `<MemberAvatar />` can reuse it without depending on a UI component.
- [X] T007 [P] Add `account.avatar.*` keys to `messages/cs.json`: at minimum `sectionTitle` ("Profilová ikona"), `defaultTileLabel` ("Výchozí (iniciály)"), `saveError`. Czech-first; no "dlužíš" anywhere.
- [X] T008 [P] Add `account.avatar.*` keys to `messages/en.json` with the same key set as T007. Run `pnpm i18n:check` to verify parity.
- [X] T009 Create unit test `tests/unit/avatars-allowlist.test.ts` covering `isValidAvatarKey`: (a) every key in `AVATAR_KEYS` returns true, (b) a deliberately invalid string like `'banana-republic'` returns false, (c) empty string returns false, (d) the type-narrowing guard works (smoke check via `// @ts-expect-error`). Depends on T004 + T005.

**Checkpoint**: At this point the palette + validator + initials helper exist and are unit-tested; user-menu has been refactored to import from `lib/avatars/initials.ts`; i18n keys are in both catalogs. NO user-facing change yet.

---

## Phase 3: User Story 1 — Member picks an avatar (Priority: P1) 🎯 MVP

**Story goal**: Tereza opens `/account`, sees the picker, taps a glyph, the choice saves immediately, header avatar updates without a reload.

**Independent test**: After T010-T014 land, a member can navigate to `/account`, see the picker section, tap a glyph, and observe the AppHeader avatar circle update on the next render tick. Refreshing the page confirms persistence.

- [X] T010 [US1] Add `setAvatarAction({ avatarKey: AvatarKey | null }): Promise<SetAvatarResult>` to `app/[locale]/(app)/account/actions.ts` per `contracts/set-avatar.md`. Guards via `requireUnlocked()`, validates the key via `isValidAvatarKey`, normalizes empty string to null, updates `members.avatar_key WHERE id = ctx.member.id`, calls `revalidatePath('/')` + `revalidatePath('/account')`. Failure codes: `INVALID_KEY`, `NO_MEMBERSHIP`.
- [X] T011 [US1] Create integration test `tests/integration/set-avatar-action.test.ts` covering all five cases in `contracts/set-avatar.md`: happy set, happy clear (null), empty-string normalized, invalid key rejected, no-membership rejected. Seed via the existing PGlite harness used by `tests/integration/void-on-behalf-authz.spec.ts` (spec 019). Mock `next/cache` (`revalidatePath`) the same way the spec-019 integration tests do.
- [X] T012 [US1] Create client component `components/account/avatar-picker.tsx`. Renders a grid of all `AVATAR_KEYS` + a "Default" tile (key=null). Each tile is a button: inline SVG glyph in an h-12 w-12 amber circle (same `bg-primary/15 text-primary` styling as the AppHeader avatar trigger). Tap calls `setAvatarAction({ avatarKey })` inside a `useTransition`, shows a sonner toast on failure, no toast on success (the visual swap is the confirmation). The currently-selected tile gets a `ring-2 ring-primary` indicator. Add a small CSS-keyframe pop on the newly-tapped tile (`feedback-playful-motion-ok` — ~250ms scale up + settle, motion-reduce disables it).
- [X] T013 [US1] Update `app/[locale]/(app)/account/page.tsx` to render a new `<section>` titled via `t('account.avatar.sectionTitle')` near the top of the page (above the existing settings rows). Server-fetch the actor's current `avatar_key` from their membership row and pass it as `currentKey` prop to `<AvatarPicker currentKey={...} />`.
- [X] T014 [US1] Create component test `tests/component/avatar-picker.test.tsx`. Mock `setAvatarAction` via `vi.mock()`. Assert: (a) all 12 palette tiles render + the Default tile (b) clicking a tile calls the action with the matching key (c) the `currentKey` prop visually marks the matching tile (d) when `currentKey` is null, the Default tile is marked.

**Checkpoint US1 complete**: Picker works on `/account`; selection saves; the AppHeader avatar... does NOT yet show the new glyph because that swap is in US2. The picker shows the selection state correctly within itself; that's the independent-test bar for US1.

---

## Phase 4: User Story 2 — Avatar shows wherever the member appears (Priority: P1)

**Story goal**: The picked avatar replaces the initials in the AppHeader user-menu trigger (and any other surface that today renders a member's identity circle). The `<MemberAvatar />` component is the swap-in.

**Independent test**: After T015-T018 land, picking an avatar in US1's picker causes the header avatar circle on every page to render the SVG glyph instead of the initials. Setting back to default restores the initials.

- [X] T015 [US2] Create `components/ui/member-avatar.tsx` — server-safe component (no `'use client'`). Props: `avatarKey: string | null`, `displayName: string`. Renders the matching SVG glyph from `lib/avatars/palette.tsx` `GLYPHS` map if `avatarKey` is valid; falls back to `initials(displayName)` from `lib/avatars/initials.ts`; falls back to `<CircleUser />` if `displayName` is empty. Same outer `h-9 w-9 rounded-full bg-primary/15 text-primary` styling as today's user-menu trigger.
- [X] T016 [US2] Create component test `tests/component/member-avatar.test.tsx`. Cover: (a) valid key → SVG path rendered with the right viewBox (b) null key + name → initials text rendered (c) unknown key + name → initials text rendered (defensive forward compat) (d) null key + empty name → CircleUser icon rendered.
- [X] T017 [US2] Update `components/nav/user-menu.tsx` to read the actor's `avatarKey` (new prop, server-passed from the layout) and render `<MemberAvatar avatarKey={avatarKey} displayName={displayName} />` inside the dropdown trigger instead of the inline `initials(...)` span. Remove the inline `initials()` call site (the function itself moved to `lib/avatars/initials.ts` in T006).
- [X] T018 [US2] Update `app/[locale]/(app)/layout.tsx` to fetch the actor's `avatar_key` alongside the existing `requireUnlocked()` call and pass it as a new `avatarKey` prop to `<AppHeader />` → `<UserMenu />`. The `<AppHeader />` signature gains one new field; the layout call site adds the new value (cheap because `ctx.member` is already loaded).

**Checkpoint US2 complete**: The actor's picked avatar shows in the header on every authenticated page. The audit captured in spec.md FR-006 (2026-05-27) confirmed the AppHeader is the only surface that renders a member-identity glyph today; FR-006 is fully satisfied. Future surfaces that add a glyph (potential follow-ups noted in T021) inherit the shared `<MemberAvatar />` and pick up picked avatars automatically — no code change in this spec for them.

---

## Phase 5: User Story 3 — Reset to initials (Priority: P2)

**Story goal**: A member who picked an avatar can revert to initials via a clear "Default" tile.

**Independent test**: After T019 lands, a member with a picked avatar opens the picker, taps the Default tile, and the AppHeader circle returns to initials (or `<CircleUser />` if displayName is empty).

- [X] T019 [US3] Verify the Default tile path in `<AvatarPicker />` from T012: tapping it calls `setAvatarAction({ avatarKey: null })`, which clears the column, which causes `<MemberAvatar />` from T015 to fall back to initials. If T012 didn't already wire this (it should have — the Default tile is part of the picker), add the missing branch. Also confirm the integration test in T011 covers the `null` path.

(T019 is mostly a verification task — US3's functionality is built into US1+US2; this task ensures the path actually works end-to-end.)

**Checkpoint US3 complete**: Reset path works. All three user stories from spec.md are deliverable.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 Run the full gate batch: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:component`, `pnpm test:i18n:check`, `pnpm test:forms:check`, `pnpm build`. All MUST pass. (Per Constitution v1.10.0 verification gates; E2E gate is dormant per plan.md test layer declaration.)
- [X] T021 Update `BACKLOG.md` — mark the "Fun avatar picker" item shipped with the spec 020 reference. Add a small follow-up bullet: "Spec 020 follow-up — once avatar adoption is high enough to justify the visual change, add a small `<MemberAvatar />` next to each member name in admin/treasurer member lists, the /tab `od X` attribution, and settle confirmation rows. Today those surfaces show text only (audited 2026-05-27); the renderer component will exist and is ready to drop in."
- [X] T022 Update `CLAUDE.md` SPECKIT marker — move spec 020 from "in flight" to "most recent shipped".
- [X] T023 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 1 (T001 → T002 → T003)
   ↓
Phase 2 — T004 [P], T005 [P], T006 [P], T007 [P], T008 [P]; then T009
   ↓
Phase 3 (US1) — T010 → T011 (depends on T010); T012 (depends on T004+T010);
                T013 (depends on T012); T014 (depends on T012)
   ↓
Phase 4 (US2) — T015 (depends on T004+T006); T016 (depends on T015);
                T017 (depends on T015); T018 (depends on T017)
   ↓
Phase 5 (US3) — T019 (verification; depends on T012+T015 already landing)
   ↓
Phase 6 (Polish) — T020 → T021 → T022 → T023
```

## Parallel Execution Examples

**Within Phase 2** (foundational scaffolding):
```
T004 (lib/avatars/palette.tsx) ┐
T005 (lib/avatars/validate.ts)  ├─ all 5 land in parallel
T006 (lib/avatars/initials.ts)  │   different files, no shared edits
T007 (messages/cs.json)         │
T008 (messages/en.json)         ┘
```
Then sequentially: T009 (unit test for the validator).

**Within Phase 3** (US1):
```
T010 (action) → T011 (integration test for the action)
                 ↘
T012 (picker component) → T013 (account page wires picker) ; T014 (component test)
```
T011 and T012 can run in parallel after T010 lands (different files, independent).

**Within Phase 4** (US2):
```
T015 (member-avatar component) → T016 (component test) ; T017 (user-menu update) → T018 (layout wires avatarKey prop)
```
T016 and T017 can run in parallel after T015 lands.

## Implementation Strategy

**MVP scope = Phase 1 + Phase 2 + Phase 3 (US1).** After MVP, picker works end-to-end on `/account` — selection saves and persists. The header avatar still shows initials until US2 lands; that's acceptable for a milestone demo because the picker itself proves the data path.

**Full v1 = MVP + Phase 4 (US2) + Phase 5 (US3) + Phase 6 (Polish).** US2 makes the picked avatar visible in the header — the user's primary "did it work?" check. US3 (reset) is mostly covered by US1's Default tile; T019 just verifies the path.

**Follow-ups deferred to BACKLOG** (captured by T021): adding `<MemberAvatar />` to surfaces that don't show a member-glyph today (admin lists, /tab attribution, settle screens). Not required by FR-006 (which says "wherever the system today renders a member's identity glyph"); a nice-to-have when avatar adoption is high enough to justify the visual change.
