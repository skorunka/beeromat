# Implementation Plan: Member-name profile links everywhere

**Branch**: `main` (trunk-based) | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-member-profile-links/spec.md`

## Summary

Make member names on the beer-IOU rows and the /tab on-behalf attribution
tap-through to `/members/[memberId]`, reusing spec 034's profile route + the
existing i18n `Link`. **Scouting found it's even smaller than specced**: the home
"match card" is literally the IOU rows (`MatchBetModule` only renders `BeerIouRow`),
and BOTH data shapes already carry the needed member id (`BeerDebtRow.counterpartyMemberId`,
`MemberTabEntry.loggerMemberId`) — so there is **no query or schema change**. Two
component edits, wrapping the avatar+name block in a `Link`. The match-hub recent-
results rows (whole-row links to the match) and the won/lost-bet mid-sentence logger
names are **deferred** (nested-anchor / `t.rich` complexity, low value) with a note.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19.2, Next.js 16 (App Router)
**Primary Dependencies**: next-intl v4 `Link` from `@/lib/i18n/navigation`, `MemberAvatar`, `Card`. Reuses spec 034 `/members/[memberId]` + spec 030 `BeerDebtRow`.
**Storage**: none — **no DB read or schema change** (ids already on the shapes).
**Testing**: Vitest + RTL component tests (mock the i18n Link → `<a>`, as `profile.spec`/`leaderboard-board.spec` do). No integration (no query change). No E2E.
**Target Platform**: mobile-first PWA, cs/en.
**Project Type**: web app.
**Performance/Constraints**: zero new data fetching. Hard rule: **no nested `<a>`**.
**Scale/Scope**: 2 component edits + 2 component tests. No new files (besides tests).

## Constitution Check

- **I. Mobile-First** — ✅ links are finger-sized (avatar+name block); existing layout.
- **II. Tenant-Aware / single-club** — ✅ only same-club members render on these rows, so links are inherently club-scoped.
- **III–VI** — ✅ no money, no auth change, no new infra, free-tier unaffected.
- **V. Auditable history** — ✅ no data writes.
- **VII. Fresh code** — ✅ no dep changes.
- **VIII. Testing Pyramid** — ✅ see declaration.
- **Test/Prod separation** — ✅ no test-only branches.

**No violations.**

### Test layer declaration

- **Unit** — N/A. No pure logic added (just JSX link wrapping).
- **Integration** — N/A. No query/shape change (ids already present); existing tab /
  IOU query coverage is untouched.
- **Component** — **Yes.** `beer-iou-row.spec` (new): counterparty avatar+name links
  to `/members/[counterpartyMemberId]`, and the deliver/write-off buttons still fire.
  `tab-entry-row.spec` (new): an on-behalf entry's "od {logger}" links to
  `/members/[loggerMemberId]`; a self entry renders no member link.
- **E2E** — N/A. Presentational navigation, not a new journey (consistent with 034).

## Project Structure

```text
specs/036-member-profile-links/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/profile-links.md
└── checklists/requirements.md

components/match/beer-iou-row.tsx   # EDIT — wrap the avatar + label block in a Link to
                                    #   /members/[debt.counterpartyMemberId]; leave the
                                    #   deliver/write-off buttons as siblings (no nesting).
components/tab/tab-entry-row.tsx    # EDIT — in the on-behalf subtitle, wrap the logger
                                    #   avatar + "od {logger}" text in a Link to
                                    #   /members/[entry.loggerMemberId]. Runda badge stays
                                    #   outside the link. Only when loggerMemberId present.
tests/component/beer-iou-row.spec.tsx   # NEW
tests/component/tab-entry-row.spec.tsx  # NEW
```

**Structure Decision**: Two surgical edits to existing components, no new shared
component (the link is a one-liner wrap; a shared `MemberNameLink` would be
over-abstraction for two call sites). Reuse `Link` + `MemberAvatar` already imported in
both files.

### Deferred (recorded, not built)

- **Match-hub recent-results rows** — each row is already a `Link` to the match; a
  per-player link nests anchors. De-nesting restructures the row layout — invasive for
  low value. Defer to BACKLOG.
- **Won/lost-bet rows** (`t('wonBet'/'fromBet', {logger})`) — the logger name is
  mid-sentence inside an ICU string; linking just the name needs `t.rich`. Low value
  (the row already links to the source match). Defer to BACKLOG.
- **Admin/history tables** — out of the match/tab/IOU/home scope; no high-value
  plain-text name found worth this pass.

## Complexity Tracking

> No violations — table intentionally empty.
