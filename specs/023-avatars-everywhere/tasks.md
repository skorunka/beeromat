---
description: "Task list — Avatars Everywhere (spec 023)"
---

# Tasks: Avatars Everywhere

**Input**: Design documents from `/specs/023-avatars-everywhere/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/member-avatar-size.md, quickstart.md

**Tests**: REQUIRED — plan.md declares integration + component layers per Constitution v1.10.0 Principle VIII. Unit + E2E are explicitly N/A.

**Organization**: Tasks grouped by user story. MVP = Phase 2 + Phase 3 (US1, treasurer recognition).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US4) on Phase 3+ tasks only
- Paths repo-root-relative

---

## Phase 1: Setup

**Purpose**: None — no schema changes, no new npm packages, no migrations, no new i18n keys. Spec reuses existing avatar primitive + URL helper.

(Skipped — proceeds directly to Phase 2.)

---

## Phase 2: Foundational (MemberAvatar size variants)

**Purpose**: Add the `size` prop + the `row` / `inline` variants to the existing component. Every user story renders the component with one of the new sizes.

- [X] T001 Extend `components/ui/member-avatar.tsx` with a `size?: 'default' | 'row' | 'inline'` prop. Map: `default` → `h-9 w-9 text-sm` (current); `row` → `h-8 w-8 text-sm`; `inline` → `h-5 w-5 text-[10px]`. Scale the inner glyph SVG + CircleUser icon: `default`/`row` keep `h-5 w-5`, `inline` uses `h-3 w-3`. `className` continues to append last so call sites can still nudge spacing. Omitting `size` MUST behave identically to today.
- [X] T002 Extend `tests/component/member-avatar.spec.tsx` with the 5 test obligations from `contracts/member-avatar-size.md`: default unchanged, `size="row"` at h-8 w-8, `size="inline"` at h-5 w-5, fallback chain preserved per size, className still appends. Depends on T001.

**Checkpoint**: Component API extended, all variants render, no regression on existing call sites (AppHeader user-menu + `/admin/members` roster + `/account` picker).

---

## Phase 3: User Story 1 — Treasurer recognizes payers at a glance (Priority: P1) 🎯 MVP

**Story goal**: Avatars next to payer names on `/admin/pending` pending + recently-confirmed lists.

**Independent test**: Seed 3 pending claims (one photo, one glyph, one neither). Open `/admin/pending` — each row shows the right avatar variant at row size; Confirm + Undo still work.

- [X] T003 [P] [US1] Extend `getPendingClaimsForTreasurer` in `lib/db/queries/payments.ts` to project `memberAvatarKey` + `memberAvatarUploadAt` from the joined `members` table (`memberId` is already in the result). Update the return type accordingly.
- [X] T004 [P] [US1] Extend `getRecentlyConfirmedPayments` in `lib/db/queries/payments.ts` to project `memberId` + `memberAvatarKey` + `memberAvatarUploadAt`. Update the return type.
- [X] T005 [US1] Integration test `tests/integration/pending-claims-avatar-fields.spec.ts`. Seed a club + 3 members (uploaded photo, glyph, neither) + 3 pending claims. Assert each result row carries `memberAvatarKey` + `memberAvatarUploadAt` matching the seeded member. Depends on T003.
- [X] T006 [US1] Integration test `tests/integration/confirmed-payments-avatar-fields.spec.ts`. Same seed shape but with confirmed payments. Depends on T004.
- [X] T007 [US1] Wire the avatar into `components/treasurer/pending-list.tsx` — render `<MemberAvatar size="row" ... uploadUrl={avatarUploadUrl(claim.memberId, claim.memberAvatarUploadAt)} avatarKey={claim.memberAvatarKey} displayName={claim.memberDisplayName} />` to the left of the existing name/amount. Depends on T003.
- [X] T008 [US1] Wire the avatar into `components/treasurer/confirmed-list.tsx` — same pattern, render before the existing name/amount. Depends on T004.

**Checkpoint US1**: Treasurer pending + confirmed queues both show payer avatars at row size; layout stable for fallback-variant rows.

---

## Phase 4: User Story 2 — Bet-time member recognition (Priority: P1)

**Story goal**: Avatars inline next to member names on `/bet` drinks-you-can-take + past-bets lists.

**Independent test**: Open `/bet` with seeded session — owner names + youTook/tookYours messages all render inline avatars.

- [X] T009 [P] [US2] Extend `getTransferableConsumptionsForCurrentSession` (or the equivalent helper in `lib/db/queries/bets.ts`) to project `ownerAvatarKey` + `ownerAvatarUploadAt` next to the existing `ownerMemberId` + `ownerDisplayName`. Update the return type.
- [X] T010 [P] [US2] Extend `getBetTransfersForSession` in `lib/db/queries/bets.ts` to project `fromAvatarKey` + `fromAvatarUploadAt` + `toAvatarKey` + `toAvatarUploadAt`. Update the return type.
- [X] T011 [US2] Integration test `tests/integration/bet-transferables-avatar-fields.spec.ts`. Seed an open session with a consumption owned by a member who has an avatar; assert the row carries the avatar fields. Depends on T009.
- [X] T012 [US2] Integration test `tests/integration/bet-transfers-session-avatar-fields.spec.ts`. Seed a session with a bet transfer between two members; assert the row carries both members' avatar fields. Depends on T010.
- [X] T013 [US2] Wire the avatar into `components/bet/transfer-list.tsx` — the "drinks you can take" section renders `<MemberAvatar size="inline" ... />` before the owner name in the label. Depends on T009.
- [X] T014 [US2] Wire the avatar into `components/bet/transfer-list.tsx` past-bets section — render `<MemberAvatar size="inline" />` inline with the youTook/tookYours message, before the named member's name. Depends on T010.

**Checkpoint US2**: `/bet` lists carry inline avatars; Beru-si-ho button + transfer flow unchanged.

---

## Phase 5: User Story 3 — On-behalf attribution feels personal (Priority: P1)

**Story goal**: Avatar inline before the "od X" subtitle on `/tab` on-behalf rows.

**Independent test**: Seed a consumption logged on the actor's behalf by someone with an avatar; open `/tab`; verify avatar appears before "od X" subtitle. Self-logs, lost-bet, match-origin rows unchanged.

- [X] T015 [US3] Extend the `MemberTabEntry` discriminated union in `lib/db/queries/consumption.ts` — for the `kind: 'on-behalf'` variant add `loggerMemberId` + `loggerAvatarKey` + `loggerAvatarUploadAt`. Other kinds untouched. Update the query (`getMyTabForSession`) to project the new fields when the row is on-behalf.
- [X] T016 [US3] Integration test `tests/integration/tab-on-behalf-avatar-fields.spec.ts`. Seed a consumption logged on behalf of the actor by a member with an avatar; assert the resulting on-behalf entry carries the three logger-avatar fields. Self-logged entries in the same result MUST NOT carry the fields (or carry them as undefined/null). Depends on T015.
- [X] T017 [US3] Wire the avatar into `components/tab/tab-entry-row.tsx` — when `entry.kind === 'on-behalf'`, render `<MemberAvatar size="inline" />` inline with the existing "od {logger}" subtitle (before the name). Other kinds unchanged. Depends on T015.
- [X] T018 [US3] Extend `tests/component/tab-entry-row.spec.tsx` with cases: (a) on-behalf row with logger avatar fields renders the avatar; (b) self row does not render an avatar; (c) lost-bet + match rows unchanged. Depends on T017.

**Checkpoint US3**: On-behalf rows show the logger's avatar inline; other origin types untouched.

---

## Phase 6: User Story 4 — Session-history bet rows show faces (Priority: P2)

**Story goal**: `/history/[sessionId]` bet-transfer rows show both members' avatars inline.

**Independent test**: Open a session detail page that has bet transfers; both members' avatars render inline with the youTook/tookYours message.

- [X] T019 [US4] Extend `getSessionDetail` in `lib/db/queries/consumption.ts` so the `transfers[]` rows carry `fromAvatarKey` + `fromAvatarUploadAt` + `toAvatarKey` + `toAvatarUploadAt`. (Reuses the same join pattern as T010; the result shape mirrors the live `/bet` past-bets list.)
- [X] T020 [US4] Wire the avatars into the bet-transfers `<li>` in `app/[locale]/(app)/history/[sessionId]/page.tsx` — render `<MemberAvatar size="inline" />` before each named member in the youTook / tookYours message. Depends on T019.

**Checkpoint US4**: Session-detail history page renders bet-transfer avatars inline; rest of the page unchanged.

---

## Phase 7: Polish & Cross-Cutting

- [X] T021 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass.
- [X] T022 Manual walkthrough per `quickstart.md` — confirm all 4 user stories' acceptance scenarios on a seeded multi-avatar club.
- [X] T023 Mark `spec.md` status `Shipped (2026-05-27)`.
- [X] T024 Update `CLAUDE.md` SPECKIT marker — move spec 023 from "in flight" to "most recent shipped".
- [X] T025 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 2 — T001 (component API) → T002 (component tests)
   ↓
Phase 3 (US1, MVP) — T003 ‖ T004 (parallel query extensions)
                     → T005 (integration test for T003)
                     → T006 (integration test for T004)
                     → T007 (wire pending) ‖ T008 (wire confirmed)
   ↓
Phase 4 (US2)      — T009 ‖ T010 (parallel query extensions)
                     → T011 (integration test for T009)
                     → T012 (integration test for T010)
                     → T013 (wire takeable) ‖ T014 (wire past-bets)
   ↓
Phase 5 (US3)      — T015 (extend MemberTabEntry on-behalf shape)
                     → T016 (integration test) ‖ T017 (wire TabEntryRow)
                     → T018 (component test for T017)
   ↓
Phase 6 (US4)      — T019 (extend getSessionDetail.transfers shape)
                     → T020 (wire history page row)
   ↓
Phase 7 (Polish)   — T021 (gates) → T022 (manual) → T023 → T024 → T025
```

## Parallel Execution Examples

**Within Phase 3 (US1)**:
```
T003 (pending query)  ‖ T004 (confirmed query)
   ↓                       ↓
T005 (test T003)        T006 (test T004)
   ↓                       ↓
T007 (wire pending)    ‖ T008 (wire confirmed)
```

**Within Phase 4 (US2)** — same shape:
```
T009 ‖ T010 → T011 ‖ T012 → T013 ‖ T014
```

## Implementation Strategy

**MVP scope = Phase 2 + Phase 3 (US1)**. After MVP, the treasurer surface (the highest-value daily-use case) carries avatars. Phase 4 (US2) is the next-highest-impact bet-night surface; Phase 5 (US3) is the personal-attribution surface; Phase 6 (US4) is the history view.

**Smallest demo cut**: T001 + T007 + T008 (skip tests + query extensions on the demo). Not shippable but proves the size variant + wiring path.

**Constitution alignment**: No E2E (Principle VIII planning-phase decision per plan.md). Integration tests guard against query shape drift; component tests guard the primitive + the most-load-bearing renderer.
