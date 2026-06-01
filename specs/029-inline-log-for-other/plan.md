# Implementation Plan: Inline "Log for Someone Else" on Home

**Branch**: `029-inline-log-for-other` (spec dir only — trunk-based on `main`) | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-inline-log-for-other/spec.md`

## Summary

Replace the home "Log for someone else" navigation link with an inline, collapse/expand control: tap → expand → `MemberPickerDropdown` + a new `BeerPickerDropdown` + Log button, all on home, no page reload. Log dispatches the existing `logBeerOnBehalfAction`, toasts + celebrates, `router.refresh()` updates the home breakdown in place, and selections persist for fast round-logging. `/log/for` stays as an unchanged deep-link fallback.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), React 19 / Next.js 16 App Router (client component for the control; home page is a server component that feeds it props).

**Primary Dependencies**: existing `MemberPickerDropdown`, base-ui DropdownMenu primitives, next-intl 4.x, sonner (toast), `celebrateBeer`, `logBeerOnBehalfAction`, `listOtherActiveMembers`. No new deps.

**Storage**: None new — reuses the on-behalf action + the member-list query + the home in-stock catalog.

**Testing**: Vitest component (jsdom + RTL). No new integration (action covered by spec 019), no E2E.

**Target Platform**: Mobile-first PWA, one-thumb, 360-wide.

**Project Type**: Web application (Next.js single app).

**Performance Goals**: One extra cheap query on home load (`listOtherActiveMembers`) — only the member list; the catalog is already loaded. No added work on the log path beyond the existing action.

**Constraints**: No page reload (client control + server action + `router.refresh()`). Czech-first i18n, reuse existing `log.onBehalf.*` keys. Big tap targets; no layout shift that hides the self-log button.

**Scale/Scope**: One new client control component, one new reusable dropdown component, one home wiring change (load members + render), i18n. ~3 source files + 2 component test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. Dropdowns with min-h-12 items, h-12 trigger + Log button; collapse/expand keeps home compact one-thumb.
- **II. Tenant-Aware Schema** — PASS. Member + beer lists are club-scoped at the source; the reused action re-validates club membership + self + stock server-side (never trusts client picks).
- **III. Track, Don't Transact** — PASS. No money path.
- **IV. Auth That Disappears** — PASS. No new action/auth surface; reuses `logBeerOnBehalfAction` under the existing authenticated home.
- **V. Auditable History** — PASS. Logging appends a consumption via the existing action; nothing deleted/mutated.
- **VI. Free-Tier First** — PASS. One small extra query on home load; no new infra.
- **VII. Fresh Code Hygiene** — PASS. No new deps; reuses primitives. The new `BeerPickerDropdown` is built on the existing DropdownMenu.
- **VIII. Testing Pyramid** — PASS. See declaration.
- **i18n catalog** — PASS. Reuse `log.onBehalf.*`; any new key cs + en, `i18n:check` gated.

No violations → Complexity Tracking omitted.

### Test layer declaration

*Required by Principle VIII.*

- **Unit (`pnpm test:unit`)** — N/A. No new pure logic; the control is interaction + the dropdown is presentational.
- **Integration (`pnpm test:integration`)** — N/A. `logBeerOnBehalfAction` + `listOtherActiveMembers` already have integration coverage (spec 019 / 024). No new DB code.
- **Component (`pnpm test:component`)** — YES. (1) `HomeLogForOther`: collapsed→expand, Log disabled until both picked, dispatches `logBeerOnBehalfAction` with the right ids, success path (toast + selections preserved), typed-error path (toast + nothing logged + selections preserved), collapse toggle. (2) `BeerPickerDropdown`: renders options with price, out-of-stock disabled, selection callback, trigger label reflects selection.
- **E2E (`pnpm test:e2e`)** — N/A. Deferred per Constitution v1.10.0; this is an inline refinement of an existing capability, not a new crucial journey.

## Project Structure

### Documentation (this feature)

```text
specs/029-inline-log-for-other/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/inline-log.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
components/picker/beer-picker-dropdown.tsx        # NEW common beer dropdown (mirrors MemberPickerDropdown)
components/home/home-log-for-other.tsx            # NEW inline collapse/expand on-behalf control
app/[locale]/(app)/page.tsx                       # load other members; replace LogForOtherLink with the new control
messages/cs.json, messages/en.json               # reuse log.onBehalf.*; add picker placeholder + any new key

tests/component/beer-picker-dropdown.spec.tsx     # NEW
tests/component/home-log-for-other.spec.tsx       # NEW
```

**Structure Decision**: Single Next.js app. The new control is a client component fed by the (server) home page with the member list + in-stock catalog it already has. The new `BeerPickerDropdown` lives under `components/picker/` next to `MemberPickerDropdown`. The existing `LogForOtherLink` is replaced on home by the new control (the link component may be left in place for `/log/for`'s own usage or removed if unused — implementer checks references).

## Complexity Tracking

*No constitution violations — section intentionally empty.*
