# Contract: `pnpm` test commands (v1.15)

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

The contract below defines the developer-facing commands the
testing pyramid exposes. The same commands are invoked by CI.

---

## Layer 1 — Unit

```bash
pnpm test:unit
```

- **Runner**: Vitest (existing).
- **Config**: `vitest.unit.config.ts`.
- **Test dir**: `tests/unit/`.
- **Environment**: `node` + PGlite (in-memory Postgres for the few unit tests that exercise the DB layer).
- **Wall time target**: ≤ 60s for the full unit suite (currently ~45s for 89 tests).
- **Watch mode**: `pnpm test:unit:watch`.

**Contract**: a unit test MUST run without Docker, without a webserver, without the production build, without network access. Failure of any of these constraints is a layer violation.

---

## Layer 2 — Component (hybrid)

### Vitest + RTL branch (default)

```bash
pnpm test:component
```

- **Runner**: Vitest 4.x with `@testing-library/react` + `@testing-library/jest-dom` matchers.
- **Config**: `vitest.component.config.ts`.
- **Test dir**: `tests/component/` (files: `*.spec.tsx`).
- **Environment**: `jsdom`.
- **Wall time target**: ≤ 30s for the migrated batch (SC-001).
- **Watch mode**: `pnpm test:component:watch`.

### Playwright CT branch (visual)

```bash
pnpm test:component:visual
```

- **Runner**: `@playwright/experimental-ct-react` (Playwright CT).
- **Config**: `playwright-ct.config.ts`.
- **Test dir**: `tests/component/` (files: `*.ct.spec.tsx` — note the `.ct.` segment in the filename).
- **Environment**: real Chromium with the project's Tailwind CSS bundled via Vite.
- **Wall time target**: ≤ 30s for the visual subset.

### Orchestrator

```bash
pnpm test:component:all   # runs both branches sequentially
```

**Contract**: a component-layer test MUST render one or more React components in isolation. It MUST NOT spawn `next start`, hit the test Postgres, or invoke any Server Action. The Vitest+RTL branch CANNOT assert computed CSS; the Playwright CT branch CAN.

---

## Layer 3 — API-mocked E2E

```bash
pnpm test:e2e-mock
# or, explicit:
pnpm playwright test --project=chromium-mock
```

- **Runner**: Playwright (standard).
- **Config**: `playwright.config.ts` (shared with true-E2E), project name `chromium-mock`.
- **Test dir**: `tests/e2e-mock/`.
- **Dependencies**: `db.setup` + `auth.setup` (so the shared admin storageState + DB schema both exist; even though THIS layer doesn't write the DB, the webserver health check and the auth context still need a baseline state).
- **Webserver**: shared production webserver on port 3100 (boots once for both mocked and true-E2E).
- **Wall time target**: ≤ 90s for the migrated batch (SC-002).

**Contract**: a mocked-E2E test MUST intercept Server Action endpoints via `page.route()` (or the `mockServerAction` helper). It MUST NOT cause real DB writes — verified post-test by asserting domain tables remain at their pre-test row counts. Auth state (cookies, PIN) is loaded from the shared `storageState`.

---

## Layer 4 — True E2E

```bash
pnpm test:e2e-full
# or, explicit:
pnpm playwright test --project=chromium
```

- **Runner**: Playwright (standard).
- **Config**: `playwright.config.ts`, project name `chromium`.
- **Test dir**: `tests/e2e/` (slimmed to ~10-12 spec files post-migration).
- **Dependencies**: `db.setup` + `auth.setup`.
- **Webserver**: shared production webserver on port 3100.
- **Fixture**: spec-014's `authedTest` with shared admin storageState.
- **Wall time target**: ≤ 12 min for the slimmed suite (SC-003).

**Contract**: a true-E2E test exercises a critical user journey end-to-end against real Postgres. It MUST be on the keep-list in research.md R8 (or have a 1-line rationale comment in the file justifying why it stayed at this layer).

---

## Orchestrators

```bash
pnpm test:e2e         # runs both Playwright projects (mocked + true)
pnpm test             # runs all four layers in order: unit → component → build → e2e
```

`pnpm test` is the top-level entry; it fails fast (a failing earlier layer prevents later layers from running).

---

## Gate ordering (per Principle VIII)

```bash
pnpm typecheck       && \
pnpm lint            && \
pnpm test:unit       && \
pnpm test:component  && \   # NEW gate 4
pnpm build           && \
pnpm test:e2e        && \
pnpm i18n:check      && \
pnpm forms:check
```

All eight MUST pass before a commit reaches `main`.
