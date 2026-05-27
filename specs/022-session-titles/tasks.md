---
description: "Task list — Custom Drink-Session Titles (spec 022)"
---

# Tasks: Custom Drink-Session Titles

**Input**: Design documents from `/specs/022-session-titles/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/set-session-title.md, quickstart.md

**Tests**: REQUIRED — plan.md declares unit + integration + component layers per Constitution v1.10.0 Principle VIII.

**Organization**: Tasks grouped by user story. MVP = Phase 2 + Phase 3 (US1). US2/US3/US4 mostly reuse what US1 builds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US4) on Phase 3+ tasks only
- Paths repo-root-relative

---

## Phase 1: Setup

**Purpose**: None — no schema changes, no new npm packages, no migrations. Spec reuses the existing `drink_sessions.title` column.

(Skipped — proceeds directly to Phase 2.)

---

## Phase 2: Foundational (Schema + i18n + Unit Test)

**Purpose**: Zod schema + Czech/English copy. Every user story depends on these. Three parallelizable tasks; T004 (unit test) depends on T001.

- [X] T001 [P] Create `lib/validation/session-title.ts` exporting `sessionTitleSchema` (Zod) + `SESSION_TITLE_MAX_LENGTH` const (60). Schema: `z.string().trim().max(60).transform((v) => v.length === 0 ? null : v)` returning `string | null`. Also export `SessionTitleInput = z.infer<...>`.
- [X] T002 [P] Add `session.title.*` keys to `messages/cs.json`: `placeholder` ("Pojmenuj tohle kolo"), `editAriaLabel` ("Upravit název kola"), `saveError` ("Nepovedlo se uložit. Zkus to znovu."), `tooLong` ("Maximálně {max} znaků"). Czech-first; no "dlužíš" (n/a).
- [X] T003 [P] Same keys in `messages/en.json` with English values. Run `pnpm i18n:check` after.
- [X] T004 Create unit test `tests/unit/session-title-schema.test.ts` covering: (a) string ≤ 60 chars passes through trimmed; (b) string > 60 chars after trim rejects; (c) empty string → null; (d) whitespace-only → null; (e) Czech diacritics preserved; (f) emoji preserved. Depends on T001.

**Checkpoint**: Schema + catalogs + unit test green. No user-facing change yet.

---

## Phase 3: User Story 1 — Name the current session from /tab (Priority: P1) 🎯 MVP

**Story goal**: Member on /tab taps the session subtitle, types a name, presses Enter or blurs → title saves and shows immediately.

**Independent test**: Member with an open session navigates to /tab, taps the inline title affordance, types a string, observes the title update on /tab + /history (still-open row) on the next render tick.

- [X] T005 [US1] Create server action `setSessionTitleAction` in `app/[locale]/(app)/tab/actions.ts` (NEW file) per `contracts/set-session-title.md`. `requireUnlocked()` guard; parses input via `sessionTitleSchema`; `UPDATE drink_sessions SET title = $1 WHERE id = $2 AND club_id = $3` — UPDATE-returning pattern so 0-rows → `NOT_FOUND`. revalidatePath(`/`, `/tab`, `/history`, `/history/${sessionId}`).
- [X] T006 [US1] Integration test `tests/integration/set-session-title-action.spec.ts` covering all 7 cases in `contracts/set-session-title.md` test obligations (happy set, happy clear, whitespace-only, trim, over-cap rejected, cross-club NOT_FOUND, retroactive on closed session). Seed via the standard PGlite + Drizzle harness; mock `next/cache`.
- [X] T007 [US1] Create shared client component `components/session/session-title-inline-edit.tsx` (NEW directory). Props: `{ sessionId: string; currentTitle: string | null; fallbackLabel: string; className?: string }`. States: idle (shows title or fallback) → editing (input pre-filled, autoFocus, max-length 60) → saving (BeerSpinner). Save triggers: Enter key OR blur. Cancel: Esc. Calls `setSessionTitleAction({ sessionId, title })`; toast.error on failure; optimistic update on success with rollback on failure.
- [X] T008 [US1] Component test `tests/component/session-title-inline-edit.spec.tsx`. Mock the server action via `vi.mock()`. Cases: (a) idle renders title when set, fallback when null; (b) click → editing state with pre-filled input; (c) Enter calls action with trimmed value; (d) blur also saves; (e) Esc cancels without save; (f) over-cap input clamped at 60 chars by maxLength; (g) error response shows toast + reverts to previous value.
- [X] T009 [US1] Wire the component into `app/[locale]/(app)/tab/page.tsx`. Replace the static `<p>{tab.session.title ?? t('drinkSession-fallback')}</p>` (or wherever the session subtitle renders today) with `<SessionTitleInlineEdit sessionId={tab.session.id} currentTitle={tab.session.title} fallbackLabel={t('drinkSession')} />`. The "no open session" empty-state path does NOT render the component (no session to name).

**Checkpoint US1 complete**: Member can name the live session on /tab; the title shows on /history + /history/[id] immediately.

---

## Phase 4: User Story 2 — Retroactively name a past session (Priority: P2)

**Story goal**: Same affordance on the per-session detail page, working for any session (current or past).

**Independent test**: Member opens `/history/[sessionId]` for a past (closed) session, taps the H1, types a name, observes update on the H1 + /history list row.

- [X] T010 [US2] Wire the component into `app/[locale]/(app)/history/[sessionId]/page.tsx`. Replace the static `<h1>{detail.session.title ?? t('drinkSession')}</h1>` with `<SessionTitleInlineEdit sessionId={detail.session.id} currentTitle={detail.session.title} fallbackLabel={t('drinkSession')} className="text-2xl font-bold" />`. The className override (text-2xl font-bold) makes the H1 styling match the existing visual weight.

**Checkpoint US2 complete**: Same affordance on the detail page; the action covers retroactive (per Q2 → β + the integration test's case 7 covers this).

---

## Phase 5: User Story 3 — Untitled sessions stay friendly (Priority: P2)

**Story goal**: Sessions with NULL title render "Kolo / Round" everywhere — no regression for members who never set a title.

**Independent test**: A session with `title = NULL` renders the localized fallback on /history list, /history/[id] H1, and /tab subtitle. Layout matches a titled session's layout (no shift).

- [X] T011 [US3] Verification only. Confirm the existing `s.title ?? t('drinkSession')` pattern in `app/[locale]/(app)/history/page.tsx` is preserved AND that the new inline-edit component's idle state renders the same fallback. No code change unless the audit surfaces a regression.

**Checkpoint US3 complete**: Standa-persona path verified — untitled sessions read as before.

---

## Phase 6: User Story 4 — Long-title guardrails (Priority: P3)

**Story goal**: Input capped at 60 chars; saved titles always fit in /history row cards.

**Independent test**: Pasting 200 chars caps at 60 in the input; the saved title doesn't overflow a /history row on a 360×640 phone.

- [X] T012 [US4] Verification. The `maxLength={60}` attribute on the inline input (T007) + the Zod max(60) (T001) double-enforce this. Spot-check the /history row card with a 60-char title on a 360-wide viewport.

---

## Phase 7: Polish & Cross-Cutting

- [X] T013 Run the full gate batch: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:integration && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build`. All MUST pass.
- [X] T014 Mark `spec.md` status `Shipped (2026-05-27)`.
- [X] T015 Update `CLAUDE.md` SPECKIT marker — move spec 022 from "in flight" to "most recent shipped".
- [ ] T016 Commit + push to `origin/main` per `feedback-no-prs-trunk-based`.

---

## Dependency Graph

```text
Phase 2 — T001 [P], T002 [P], T003 [P]; then T004 (depends on T001)
   ↓
Phase 3 (US1, MVP) — T005 → T006 (integration test); T007 → T008 (component test); T009 (depends on T005+T007)
   ↓
Phase 4 (US2) — T010 (depends on T007)
   ↓
Phase 5 (US3) — T011 (verification, depends on T007+T009+T010)
   ↓
Phase 6 (US4) — T012 (verification, depends on T007)
   ↓
Phase 7 (Polish) — T013 → T014 → T015 → T016
```

## Parallel Execution Examples

**Within Phase 2** (foundational scaffolding):
```
T001 (Zod schema)   ┐
T002 (cs.json keys)  ├─ all 3 land in parallel, different files
T003 (en.json keys) ┘
```
Then T004 (unit test, depends on T001).

**Within Phase 3 (US1)**:
```
T005 (action)       → T006 (integration test for the action)
T007 (component)    → T008 (component test for the component)
                      ↘
                       T009 (wires component into /tab page; depends on both)
```
T005+T006 and T007+T008 can run in parallel pairs.

## Implementation Strategy

**MVP scope = Phase 2 + Phase 3 (US1).** After MVP, members can name the live session from /tab; titles persist + show on /history. Phases 4-6 are small extensions (US2 is one file edit; US3/US4 are verification).

**Smallest demo cut**: T001 + T005 + T007 + T009. Skips tests + i18n keys for raw demo; not shippable but proves the path.
