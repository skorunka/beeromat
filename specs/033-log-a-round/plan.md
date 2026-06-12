# Implementation Plan: Log a round

**Branch**: `main` (trunk-based — no feature branch) | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-log-a-round/spec.md`

## Summary

Turn the home "log for another member" control into a **multi-select round
logger**: pick one default beer, tap the avatars of everyone drinking (the
logger included), optionally override one person's beer, and confirm once to
record a beer on **each drinker's own tab**. A new `logRoundAction` writes N
consumptions in a single transaction, reusing the exact per-beer steps the
existing single-log paths already use (verify beer → decrement stock → audit
row → get-or-open session → insert consumption). Out-of-stock beers are skipped
and reported (partial success); everything else commits. **No schema change, no
migration** — a "round" is transient client state; the only persisted rows are
ordinary `consumptions`, and a self-beer in the round is just a consumption
whose `member_id == created_by`'s member (so it produces no "logged for you"
review, while teammates' beers do, exactly as today).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), Node 24 LTS

**Primary Dependencies**: Next.js 16 App Router, React 19.2, Drizzle ORM 0.45.x
(Neon Postgres), next-intl v4, Tailwind 4, base-ui, react-hook-form + Zod (forms
standard — but this control is a tap-driven picker, not a text form; see below).

**Storage**: Neon Postgres via Drizzle. Reuses `consumptions`, `beer_types`
(stock), `stock_changes`, `drink_sessions`. **No new tables.**

**Testing**: Vitest unit (`tests/unit/`), Vitest + PGlite integration
(`tests/integration/`), Vitest + RTL + jsdom component (`tests/component/`).

**Target Platform**: Mobile-first PWA (one-thumb), club-scoped multi-tenant.

**Project Type**: Web app (Next.js App Router, single project).

**Performance Goals**: Compose + submit a 2–7 person round in < 15s (SC-003);
one server round-trip for the whole round (one transaction).

**Constraints**: Each drinker owes their own beer (no money-transfer model);
one beer per drinker per round; reuse existing on-behalf + review machinery.

**Scale/Scope**: Club-scale (≤ ~30 active members); a round is typically 2–7
drinkers. One new server action, one new query, one evolved component, one Zod
schema, i18n keys. ~3 test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Mobile-First PWA** — PASS. A tap-only avatar multi-select + one button;
  no keyboard, no desktop requirement. One-thumb operable.
- **II. Tenant-Aware Schema, Single-Club UX** — PASS. Every read/write is
  `club_id`-scoped; the action verifies each drinker is an active member of the
  actor's club, and the beer belongs to the club (same guards as the existing
  log paths). No cross-club leak.
- **III. Track, Don't Transact** — PASS. No money moves; each beer is a
  consumption on the drinker's own tab. The "bringer treats" money model was
  explicitly rejected in the spec.
- **IV. Auth** — PASS. Reuses `requireUnlocked` (magic-link + device PIN); no
  new auth surface. Authorization mirrors the existing self-log and on-behalf
  log (own club, active members).
- **V. Auditable History (no hard deletes)** — PASS. Each beer is an append-only
  `consumptions` row with `created_by_user_id` + a `stock_changes` audit row;
  undo/reject reuse the existing compensating-row `voidConsumptionAction`. No
  whole-round mutation. Reversibility is preserved per-beer (the on-behalf
  "logged for you" review + the undo window), which the UI already exposes.
- **VI. Free-Tier First** — PASS. No new infra. One extra transaction.
- **VII. Fresh Code Hygiene** — PASS. No dependency changes.
- **VIII. Testing Pyramid** — PASS (see declaration below).
- **User Input & Forms standard** — PASS / N/A for forms: the round logger is a
  tap-driven picker (avatar toggles + dropdown beer pickers), not a text-input
  form. No native `required`/`pattern`, no native date/time input — `forms:check`
  stays green. Server-side authority is the Zod schema validated in the action.
- **i18n** — PASS. All new strings flow through the `cs`/`en` catalogs; counts
  use ICU plurals ("N piv" / "N beers"); `i18n:check` enforces parity.

**Personas note (Spec & Task Discipline):** the repo's `spec-template.md` has no
Personas section and recent specs (027–032) follow the template without one; this
spec keeps that convention. The relevant users are described inline — the
**fetcher** (the member up to get the round, composing + submitting) and the
**absent teammate** (gets a "logged for you" review item to keep/reject). Flagged
here rather than silently skipped; not treated as a blocker, consistent with the
shipped precedent.

### Test layer declaration

- **Unit (`pnpm test:unit`)** — YES. The round Zod schema (`logRoundSchema`):
  non-empty `items`, each `{memberId, beerTypeId}` a uuid, **memberIds distinct**
  (FR-012). Pure validation → unit. Any pure summary helper (e.g. building the
  toast text from logged/skipped counts) lands here too.
- **Integration (`pnpm test:integration`)** — YES. `logRoundAction` is the new
  DB-coupled core: a single transaction writing N consumptions. Cases: N beers
  on N distinct tabs (incl. the logger's own) with correct price + stock −N; the
  logger's own beer produces **no** "logged for you" review while teammates' do;
  **partial success** when one beer is out of stock (rest committed, skipped
  reported); **all-skipped** returns the failure code and writes nothing;
  cross-club / inactive member rejected; duplicate memberId rejected by the
  schema (guarded before the action). PGlite, real SQL.
- **Component (`pnpm test:component`)** — YES. The evolved round-logger
  component (action mocked with `vi.mock()`): avatar toggle selects/deselects,
  the logger is pre-selected, the live "🍺 ×N" count + submit label update, submit
  is disabled at zero drinkers, a per-person beer override changes that drinker's
  payload and clears back to the default, success resets the selection.
- **E2E (`pnpm test:e2e`)** — **N/A, not warranted.** This evolves the existing,
  already-shipped on-behalf log (spec 019/029) — itself shipped without an E2E —
  and the end-to-end seam (auth context → action → consumption round-trip) is the
  same one those specs exercised. The new behaviour is batch fan-out + partial
  skip, fully verified at the integration layer, plus the UI at the component
  layer. The project's E2E suite is intentionally limited to onboarding (spec
  016) until a crucial-journey "log a beer → tab → undo" suite is spec'd as its
  own slice (consistent with specs 027–032). Declaring E2E here would add the
  Playwright stack back for one non-journey-defining increment.

**Result: PASS — no Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/033-log-a-round/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — entities (no schema change) + validation
├── quickstart.md        # Phase 1 — how to exercise it
├── contracts/
│   ├── round-action.md  # logRoundAction server-action contract
│   └── round-logger.md  # round-logger component contract
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
lib/
├── validation/
│   └── round.ts                      # NEW — logRoundSchema (items, distinct memberIds)
├── db/queries/
│   └── members.ts                    # MODIFY — listActiveMembersForRound (incl self, avatar fields)
└── round/
    └── summarize-round.ts            # NEW (optional) — pure logged/skipped → toast summary

app/[locale]/(app)/
├── log/actions.ts                    # MODIFY — add logRoundAction (batched tx)
└── page.tsx                          # MODIFY — pass the self+others round roster to the control

components/home/
└── round-logger.tsx                  # EVOLVE home-log-for-other.tsx → multi-select round logger
                                      #   (rename; keep the inline-on-home behaviour from spec 029)

components/picker/
└── member-multi-select.tsx           # NEW — avatar toggle grid (multi-select), reuses MemberAvatar

messages/{cs,en}.json                 # MODIFY — round.* keys (title, count plural, submit, toasts, override)

tests/
├── unit/round-schema.spec.ts         # NEW — logRoundSchema
├── integration/log-round-action.spec.ts  # NEW — batched tx, partial skip, review distinction
└── component/round-logger.spec.tsx   # NEW — multi-select + override + submit states
```

**Structure Decision**: Single Next.js project (the established layout). The
feature is additive: one new server action alongside the existing `log/actions.ts`
pair, one new query, one evolved home component + one new picker primitive, one
Zod schema. No `drizzle/` migration. The spec-029 "stay on home, refresh in
place, keep selection" behaviour is preserved and extended to the multi-select.

## Complexity Tracking

No Constitution Check violations — table intentionally empty.
