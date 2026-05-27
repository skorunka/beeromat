---
description: "Task list — Picker Avatars (spec 024)"
---

# Tasks: Picker Avatars

**Input**: Design documents from `/specs/024-picker-avatars/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{member-picker-grid,member-picker-dropdown}.md, quickstart.md

**Tests**: REQUIRED — plan.md declares integration + component layers per Constitution v1.10.0 Principle VIII. Unit + E2E are explicitly N/A.

**Organization**: Tasks grouped by user story. MVP = Phase 2 + Phase 3 (US1, tap-to-pick on /log/for).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US3) on Phase 3+ tasks only
- Paths repo-root-relative

---

## Phase 1: Setup

**Purpose**: None — no schema, no new npm packages, no migrations, no new i18n keys. Spec reuses MemberAvatar (spec 023), DropdownMenu (existing primitive), and existing form labels.

(Skipped — proceeds directly to Phase 2.)

---

## Phase 2: Foundational (member-list query extensions + new `MemberOption` type)

**Purpose**: Two existing queries gain avatar fields; a new `members.ts` query module extracts the `/log/for` inline query into a testable helper. Both pickers share the same `MemberOption` shape.

- [X] T001 [P] Extend `listActiveClubMembers` in `lib/db/queries/match-agreements.ts` to also `.select` `avatarKey` + `avatarUploadAt` from `members`. Update the inferred return type. Callers (existing `/match` pages) keep working because added fields are additive.
- [X] T002 [P] Create new module `lib/db/queries/members.ts` exporting `listOtherActiveMembers(clubId, excludingMemberId)` returning `{ id, displayName, avatarKey, avatarUploadAt }[]`. Migrate the inline query from `app/[locale]/(app)/log/for/page.tsx` to call this helper (page becomes `await listOtherActiveMembers(ctx.club.id, ctx.member.id)`).
- [X] T003 Define + export a shared `MemberOption` type in `components/picker/types.ts` (NEW file): `{ id: string; displayName: string; avatarKey: string | null; avatarUploadAt: Date | null }`. Both new picker components import this.

**Checkpoint**: Both queries return avatar fields; the `MemberOption` shape is shared across consumers. No UI change yet.

---

## Phase 3: User Story 1 — Tap-to-pick member on /log/for (Priority: P1) 🎯 MVP

**Story goal**: Replace the native `<select>` member control on `/log/for` with a member tile grid (avatar + name per tile), matching the existing beer tile grid.

**Independent test**: Seed a session with three other active members (mixed avatars). Open `/log/for`. Tile grid renders. Tap a tile → submit → on-behalf log lands on the chosen member.

- [X] T004 [US1] Create `components/picker/member-picker-grid.tsx` per `contracts/member-picker-grid.md`. Client component. Props per the contract: `{ members: MemberOption[]; value: string | null; onChange: (id: string | null) => void; ariaLabel?: string; className?: string }`. Tile button per member; selected style matches the beer-tile selected state; tap-on-selected clears.
- [X] T005 [US1] Component test `tests/component/member-picker-grid.spec.tsx` covering the 7 test obligations in the contract (renders all options, avatar variant per option, selection state, onChange fires on pick, tap-on-selected clears, empty members renders nothing, keyboard accessibility). Depends on T004.
- [X] T006 [US1] Integration test `tests/integration/list-other-active-members-avatar-fields.spec.ts`. Seed a club + a caller + 3 other members (mixed avatars). Assert each result row carries `avatarKey` + `avatarUploadAt` matching the seeded member, AND that the caller is excluded from the result. Depends on T002.
- [X] T007 [US1] Wire the grid into `components/log/log-on-behalf-form.tsx` — replace the `<select id="onBehalfMember">…</select>` block with `<MemberPickerGrid members={members} value={memberId} onChange={(id) => setMemberId(id ?? '')} ariaLabel={t('memberHint')} />`. Bump the `MemberOption` type referenced by the form's `members` prop to match `MemberOption` from T003 (id + displayName + avatarKey + avatarUploadAt). The page (`/log/for/page.tsx`) already passes those fields after T002.
- [X] T008 [US1] Wiring smoke test `tests/component/log-on-behalf-form.spec.tsx` (NEW). Mock `logBeerOnBehalfAction`. Render the form with seeded members + beers. Click a member tile → click a beer tile → click submit → assert the action is called with `{ targetMemberId, beerTypeId }`. Depends on T007.

**Checkpoint US1**: /log/for renders the member tile grid; the on-behalf log flow still works end-to-end.

---

## Phase 4: User Story 2 — Avatar dropdown per seat on /match (Priority: P1)

**Story goal**: Replace each native `<select>` seat control with `MemberPickerDropdown`. Trigger doubles as the picked-state preview (avatar + name + chevron).

**Independent test**: Open the new-agreement form, pick doubles, open each of the 4 seat triggers — each shows avatars next to candidate names. Pick four members → submit → agreement is created with the correct lineup. Same flow on the edit form.

- [X] T009 [US2] Create `components/picker/member-picker-dropdown.tsx` per `contracts/member-picker-dropdown.md`. Client component using `DropdownMenu` primitive (base-ui). Props: `{ members, value, onChange, disabledIds?, placeholder, ariaLabel, className? }`. Trigger states: unpicked → placeholder + chevron; picked → avatar (size="row") + name + chevron. Option rows show avatar (size="inline") + name. Top "—" option fires `onChange(null)`. `disabledIds` exclude `value` from the disable effect.
- [X] T010 [US2] Component test `tests/component/member-picker-dropdown.spec.tsx` covering the 9 test obligations in the contract (trigger placeholder, trigger picked state, popup renders all options, avatar variant per option, onChange fires, clear fires onChange(null), disabledIds disables matching, current value is NOT disabled, keyboard accessibility). Depends on T009.
- [X] T011 [US2] Integration test `tests/integration/list-active-club-members-avatar-fields.spec.ts`. Seed a club + 4 active members (mixed avatars) + 1 inactive member. Assert the result row count matches active-only; assert each row carries the new avatar fields. Depends on T001.
- [X] T012 [US2] Wire the dropdown into `app/[locale]/(app)/match/NewMatchAgreementForm.tsx` — for EACH seat field (a1, a2 for singles; a1, a2, b1, b2 for doubles): replace the `<select>` with `<MemberPickerDropdown members={members} value={field.value || null} onChange={(id) => field.onChange(id ?? '')} placeholder={t('seatPlaceholder')} ariaLabel={t(seatLabelKey)} />` inside the existing `<FormField>` controller. The `members` prop now carries avatar fields (after T001). disabledIds wiring lives in US3 (T014).
- [X] T013 [US2] Same swap in `app/[locale]/(app)/match/EditAgreementForm.tsx` — same per-seat replacement; the pre-populated seat values flow through the trigger's picked-state render so the form loads showing the lineup as faces. Depends on T009.

**Checkpoint US2**: /match new + edit forms render the avatar dropdown per seat; the agreement submit still works; trigger shows the lineup at-a-glance.

---

## Phase 5: User Story 3 — Duplicate-seat protection (Priority: P2)

**Story goal**: Members already assigned to another seat in the same agreement form render disabled in the other seat pickers.

**Independent test**: Pick member X for A1; open A2's picker → X is disabled. Clear A1 → X becomes selectable again. Switch format singles ↔ doubles → disable-set recomputes correctly.

- [X] T014 [US3] Wire `disabledIds` into the seat dropdowns in `app/[locale]/(app)/match/NewMatchAgreementForm.tsx`. Use `useWatch({ control, name: ['a1', 'a2', 'b1', 'b2'] })` (or the seat-fields array as defined) to subscribe to all seat values; compute `assignedIds = new Set(seatValues.filter(Boolean))`; pass `disabledIds={assignedIds}` into each `MemberPickerDropdown`. The dropdown internally excludes its own current `value` from the disable effect (per contract).
- [X] T015 [US3] Same wiring in `app/[locale]/(app)/match/EditAgreementForm.tsx`.
- [X] T016 [US3] Format-switch reset: when the format toggle flips singles → doubles or vice versa, ensure any out-of-range seat values are cleared (b1, b2 cleared when switching to singles). If existing form logic already handles this, verify and document; otherwise add the reset. The disable-set recomputes automatically from the cleared values.

**Checkpoint US3**: Duplicate-seat assignment is prevented at the UI layer; the server-side validator remains as belt-and-braces.

---

## Phase 6: Polish & Cross-Cutting

- [X] T017 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass.
- [X] T018 Manual walkthrough per `quickstart.md` — confirm all 3 user stories on a seeded multi-avatar club. Tab-only keyboard navigation also exercised on both shapes.
- [X] T019 Mark `spec.md` status `Shipped (2026-05-27)`.
- [X] T020 Update `CLAUDE.md` SPECKIT marker — move spec 024 from "in flight" to "most recent shipped".
- [X] T021 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 2 — T001 ‖ T002 (parallel query work) → T003 (shared type)
   ↓
Phase 3 (US1, MVP) — T004 (grid component)
                     → T005 (component test)
                   T006 (integration test for T002)
                     → T007 (wire grid into /log/for form, depends on T003+T004)
                     → T008 (wiring smoke test)
   ↓
Phase 4 (US2)      — T009 (dropdown component)
                     → T010 (component test)
                   T011 (integration test for T001)
                     → T012 (wire into NewMatchAgreementForm, depends on T003+T009)
                     → T013 (wire into EditAgreementForm)
   ↓
Phase 5 (US3)      — T014 (disabledIds on New form)
                     → T015 (disabledIds on Edit form)
                     → T016 (format-switch reset verification)
   ↓
Phase 6 (Polish)   — T017 (gates) → T018 (manual) → T019 → T020 → T021
```

## Parallel Execution Examples

**Within Phase 2** (foundational):
```
T001 (extend match-agreements query)  ‖  T002 (new members.ts module + page swap)
                                  ↓
                              T003 (shared MemberOption type)
```

**Within Phase 3 (US1)**:
```
T004 (grid component)  →  T005 (component test)
T006 (integration test for the helper)
                ↘
                  T007 (wire into form) → T008 (wiring smoke)
```

**Within Phase 4 (US2)** — analogous shape:
```
T009 (dropdown)  →  T010 (component test)
T011 (integration test)
              ↘
                T012 (wire into NewForm) ‖ T013 (wire into EditForm)
```

## Implementation Strategy

**MVP scope = Phase 2 + Phase 3 (US1)**. After MVP, `/log/for` ships with the avatar tile grid; users get the recognition win on the most-frequently-used picker. Phase 4 (US2) is the second-highest-impact surface (match-night lineup); Phase 5 (US3) is a UX cleanup that closes a real-but-mild bug.

**Smallest demo cut**: T003 + T004 + T007 (skip tests + helper extraction; reuse the existing inline query). Not shippable but proves the path on one surface.

**Constitution alignment**: No E2E (Principle VIII planning-phase decision per plan.md). Integration tests guard query shape drift; component tests guard the primitive picker shapes; the wiring smoke test on `LogOnBehalfForm` catches the dumb mistake of hooking the new picker up wrong.
