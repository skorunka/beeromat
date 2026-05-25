<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/015-testing-pyramid-split/plan.md` (the v1.15 spec —
splits the test suite into four layers: Unit / Component / API-mocked
E2E / True E2E, codifies the testing pyramid as Constitution Principle
VIII, and replaces the legacy `globalSetup` race with a `db.setup.ts`
Playwright project). Companion artifacts in the same directory:
`spec.md`, `research.md`, `data-model.md`, `quickstart.md`,
`contracts/layer-commands.md`, `contracts/constitution-amendment.md`,
`checklists/requirements.md`. Spec 014 (E2E perf — storageState reuse)
landed as a stopgap on `main` ahead of this work; its `authedTest`
fixture is reused by the true-E2E layer in 015. Earlier shipped
features live at `specs/001-beer-consumption-ledger/` through
`specs/013-matches-doubles-prematch/` — their `plan.md` /
`data-model.md` / `contracts/` remain the source of truth for the
data model, server action contracts, and prior decisions.
Constitution at `.specify/memory/constitution.md` (v1.7.0 → bumping
to v1.8.0 with the Principle VIII amendment bundled into spec 015's
US1 commit per the Q4 clarification).
<!-- SPECKIT END -->
