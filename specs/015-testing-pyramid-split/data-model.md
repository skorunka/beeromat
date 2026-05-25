# Data Model: Testing Pyramid Split (v1.15)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This spec is test-infrastructure. There is **no domain data model
change** — no schema migrations, no new tables, no new entities in
the production database.

The "entities" in this spec live in documentation + test-config
structure. They are listed below so `/speckit-tasks` has discrete
buckets to target.

## Entity: Test Layer

A test layer is the combination of:

| Attribute | Type | Example |
|---|---|---|
| `name` | string | `unit`, `component`, `e2e-mock`, `e2e` |
| `runner` | string | `vitest` / `vitest+rtl` / `playwright-ct` / `playwright` |
| `config_file` | path | `vitest.unit.config.ts`, `vitest.component.config.ts`, `playwright-ct.config.ts`, `playwright.config.ts` |
| `test_dir` | path | `tests/unit/`, `tests/component/`, `tests/e2e-mock/`, `tests/e2e/` |
| `command` | string | `pnpm test:unit`, `pnpm test:component`, `pnpm test:e2e-mock`, `pnpm test:e2e` |
| `gate_position` | int | 3, 4, 6, 6 *(component is new gate 4; mocked + true-E2E share `pnpm test:e2e` orchestrator)* |
| `assertion_capabilities` | enum-set | `{logic}`, `{logic, dom-events, locale}`, `{logic, dom-events, locale, computed-css}`, `{everything inc. real-DB writes}` |

Five constraints across the layers:

1. **No DB writes** at layers 2 and 3 (component, mocked-E2E). Verified by `truncateAll(db)` returning 0 changes after a run at those layers (could be a smoke check in CI).
2. **No webserver** at layers 1 and 2. Verified by neither command spawning `next start`.
3. **No production code changes** at any layer (constitution Test/Prod Separation).
4. **One gate per layer** (except 3 and 4 share `pnpm test:e2e` orchestrator). Verified by the gate-list count = 8.
5. **Tests authored at the lowest-possible layer.** Reviewer rule per Principle VIII; no mechanical gate but a documented heuristic.

## Entity: Spec Categorisation Record

For each of the 33 currently-E2E spec files, one record (lives in
research.md R8):

| Attribute | Type | Example |
|---|---|---|
| `source_path` | path | `tests/e2e/forms-admin.spec.ts` |
| `target_layer` | enum | `unit` / `component-rtl` / `component-ct` / `e2e-mock` / `e2e` |
| `rationale` | string (≤ 1 sentence) | "Form-validation messages on /sign-in. No DB write asserted." |
| `migration_action` | enum | `move` / `split` / `keep` |
| `split_details` | string (optional) | "scenarios 1-3 → component; scenarios 4-5 → e2e" |

The full list of 33 records is in research.md R8. `/speckit-tasks`
will generate one migration task per record.

## Entity: Constitution Principle VIII (additive)

A new section in `.specify/memory/constitution.md`. Not a runtime
entity — pure documentation. The full proposed text is in
`contracts/constitution-amendment.md`.

Fields it adds to the project's normative vocabulary:

- **Four-layer pyramid** (the four layer names + the decision rule)
- **Layer-decision rule** (one-paragraph heuristic for which layer
  a new test belongs in)
- **Gate restructuring** (8 gates, with component as the new gate 4)

State transitions: this principle has no states — it lands as text
and stays. Future amendments (multi-tenant testing, contract
testing, etc.) extend the section.

## Entity: Mocked Server Action Response

A typed contract used by the mocked-E2E layer. Lives in
`tests/e2e-mock/fixtures/mock-action.ts` (per research R5). Not a
DB entity; it's a TypeScript discriminated union mirroring the
production Server Action's return type (so the mock can't drift
from the real shape).

```ts
// Example shape — actual definitions live alongside each action.
type CreateAgreementMockResponse =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'DUPLICATE_MEMBER' };
```

Validation rule: each mocked response MUST match the action's
return type (TypeScript catches drift at compile time). If the
production action's return type changes, the mock fixture's
TypeScript-check fails — built-in safety net.

## Derived: gate ordering (after Principle VIII)

```text
Gate 1 — pnpm typecheck
Gate 2 — pnpm lint
Gate 3 — pnpm test:unit
Gate 4 — pnpm test:component   ← NEW
Gate 5 — pnpm build
Gate 6 — pnpm test:e2e          (runs mocked + true-E2E projects)
Gate 7 — pnpm i18n:check
Gate 8 — pnpm forms:check
```

No state transitions; gates are pass/fail per commit.
