---
description: "Task list for spec 036 — member-name profile links everywhere"
---

# Tasks: Member-name profile links everywhere

**Input**: Design documents from `specs/036-member-profile-links/`

**Tests**: Component tests included (plan declares component-only; no unit/integration/E2E).

**Organization**: By user story. US1 = IOU counterparty link (MVP). US2 = /tab on-behalf logger link. US3 folds into US1 (home match card = the IOU rows). Authored on `main`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm working tree clean on `main`; dev server up (`localhost:3010`) for live checks. No deps/config changes (presentational only).

---

## Phase 2: Foundational

*None — no shared infra, no query/schema change (ids already on `BeerDebtRow` + `MemberTabEntry`). Stories are independent.*

---

## Phase 3: User Story 1 — IOU counterparty link (Priority: P1) 🎯 MVP

**Goal**: Tapping the counterparty avatar/name on a beer-IOU row opens that member's profile; deliver/write-off controls keep working; no nested anchors.

**Independent Test**: Render a `BeerIouRow`; the avatar+name is an anchor → `/members/[counterpartyMemberId]`; clicking a control still fires its handler.

- [X] T002 [US1] In `components/match/beer-iou-row.tsx`, wrap the avatar + label block (the `MemberAvatar` + the `min-w-0 flex-1` text `<div>`) in a `Link` (`@/lib/i18n/navigation`) to `/members/${debt.counterpartyMemberId}`; add a subtle hover-underline on the name; keep the deliver/write-off/cancel buttons as SIBLINGS outside the Link (no nested `<a>`). Per contracts/profile-links.md.
- [X] T003 [P] [US1] Add `tests/component/beer-iou-row.spec.tsx` (RTL, mock `@/lib/i18n/navigation` Link → `<a>`, mock the match server actions + `useConfirm`): assert the counterparty name renders as an anchor whose href ends `/members/<counterpartyMemberId>`; assert tapping "Předáno" calls the deliver action (link didn't capture it). (Gate: `pnpm test:component`.)

**Checkpoint**: IOU rows (home + /match settle) drill into the counterparty profile.

---

## Phase 4: User Story 2 — /tab on-behalf logger link (Priority: P2)

**Goal**: On /tab, an "od {logger}" on-behalf attribution links to the logger's profile; self-logged rows show no member link; the Runda badge stays outside the link.

**Independent Test**: Render a `TabEntryRow` with an on-behalf entry (`loggerMemberId` set) → "od {logger}" is an anchor → `/members/[loggerMemberId]`; a self entry renders no member link.

- [X] T004 [US2] In `components/tab/tab-entry-row.tsx`, wrap the on-behalf subtitle's `MemberAvatar` + `t('byOther', {logger})` text in a `Link` to `/members/${entry.loggerMemberId}` (only when `loggerMemberId` is present); keep the `🍺 Runda` badge OUTSIDE the link; leave the text-only fallback (no `loggerMemberId`) and the bet-row `t('wonBet'/'fromBet')` sentences unchanged. Per contracts/profile-links.md.
- [X] T005 [P] [US2] Add `tests/component/tab-entry-row.spec.tsx` (RTL, mock the i18n Link → `<a>`): on-behalf entry → "od {logger}" anchor href ends `/members/<loggerMemberId>`; self entry → no `/members/` link; (optional) bet row still links only to `/match/<id>`. (Gate: `pnpm test:component`.)

**Checkpoint**: /tab on-behalf attribution drills into the logger profile.

---

## Phase 5: Polish & Cross-Cutting

- [X] T006 Run gates: `pnpm typecheck && pnpm lint && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. (No unit/integration impact.)
- [X] T007 Live-walk quickstart.md on the heavy seed via the Docker MCP browser — IOU tap, tab "od X" tap, controls still fire, match-result rows still navigate (no nested-link regression).
- [X] T008 [P] Update `BACKLOG.md`: record the deferred bits (match-hub recent-results per-player links — nested anchor; won/lost-bet mid-sentence logger names — needs `t.rich`).
- [X] T009 [P] Flip `CLAUDE.md` SPECKIT marker for 036 from ACTIVE PLAN → shipped (as-built) once validated.

---

## Dependencies & Execution Order

- **Setup (T001)** → stories. No Foundational phase.
- **US1 (T002–T003)** and **US2 (T004–T005)** are independent (different files) — can be done in either order / parallel. US1 is the MVP.
- **Polish (T006–T009)** after the desired stories.
- `[P]`: T003, T005, T008, T009 are parallelizable (distinct files).

## Implementation Strategy

MVP = US1 (IOU link). Then US2 (tab on-behalf). Ship both together (one cohesive
"names are tappable" change), run gates, live-walk, then the milestone validation
checkpoint before push/deploy.

## Notes

- Hard rule: never nest `<a>` in `<a>`. Both target rows are `Card` divs (not row-links), so wrapping the name block is safe; the only row-link surface (match-hub results) is deferred.
- No query/schema change — do not touch the queries; the ids are already present.
- Don't re-test the IOU deliver/void actions' core behaviour (already covered) — the new component tests only assert the link + that controls still fire.
