# Quickstart: Testing Pyramid Split (v1.15)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Manual verification walk-through for spec 015 after `/speckit-implement` lands the code. Run through this after every user-story checkpoint to confirm the spec's behaviour holds.

---

## Prerequisites

- Local docker stack up: `pnpm docker:up`.
- `pnpm install` (fresh install picks up the new `@playwright/experimental-ct-react` dep).
- `pnpm exec playwright install chromium` (one-time per machine).

---

## US1 — Component layer exists and works (P1 — MVP)

### Setup

Nothing — the layer's whole point is "no infrastructure".

### Steps

1. Run `pnpm test:component`. Assert:
   - Exits green in under 10 seconds (cold run).
   - At least 1 test runs and passes.
   - No `next build`, no `pnpm start`, no Docker call appears in the output.

2. Open the sample test file (e.g., `tests/component/brand-mark.spec.tsx`). Tweak a styling assertion to FAIL (e.g., expect a colour that isn't there). Re-run `pnpm test:component`. Assert:
   - Test fails clearly.
   - Re-run time is under 3 seconds (warm cache).
   - Revert the bad assertion; re-run; green again.

3. Run `pnpm test:component:visual`. Assert:
   - At least 1 Playwright CT test runs against a real Chromium.
   - The test's visual assertions (computed colour, font, touch-target size) match reality.

### Spec mapping

US1 acceptance scenarios 1 + 2.

---

## US2 — API-mocked E2E layer exists (P2)

### Steps

1. Run `pnpm test:e2e-mock` (or `pnpm playwright test --project=chromium-mock`). Assert:
   - The webserver builds + boots ONCE (~80s cold).
   - At least 1 mocked-E2E test runs and passes.
   - Inspect the test DB after the run: `docker exec beeromat-postgres psql -U beeromat -d beeromat_test -c "SELECT COUNT(*) FROM payments"` returns 0. No domain writes happened.

2. Open the sample test file (e.g., `tests/e2e-mock/sample-form-error.spec.ts`). Note the `mockServerAction` call in `beforeEach`. Verify the helper signature matches the `contracts/match-agreements.md`-style discriminated union from the real action.

### Spec mapping

US2 acceptance scenario 1.

---

## US3 — At least 4 specs migrated to the component layer (P2)

### Steps

1. List the migrated specs. Per research.md R8, the first 4-6 are likely:
   - `ux-i18n.spec.ts` → `tests/component/ui-i18n.spec.tsx`
   - `ux-bet-no-session.spec.ts` → `tests/component/bet-empty-state.spec.tsx`
   - `ux-loading.spec.ts` → `tests/component/loading-skeleton.spec.tsx`
   - `ux2-guidance.spec.ts` → `tests/component/guidance-banners.spec.tsx`
2. Run `pnpm test:component`. Confirm all migrated specs pass.
3. Run `pnpm test:e2e`. Confirm:
   - The migrated specs no longer appear in the run (no double-coverage).
   - The true-E2E wall time has dropped by the cumulative cost the migrated specs previously contributed.

### Spec mapping

US3 acceptance scenarios 1 + 2.

---

## US4 — At least 4 specs migrated to the mocked-E2E layer (P3)

### Steps

1. List the migrated specs. Per R8, the first 4 are likely:
   - `forms-admin.spec.ts` → `tests/e2e-mock/admin-forms.spec.ts`
   - `forms-money.spec.ts` → `tests/e2e-mock/money-forms.spec.ts`
   - `forms-auth.spec.ts` → `tests/e2e-mock/auth-forms.spec.ts`
   - `ux2-stock-friendlier.spec.ts` → `tests/e2e-mock/stock-ui.spec.ts`
2. Run `pnpm test:e2e-mock`. All pass.
3. Run `pnpm test:e2e`. The 4 migrated specs are gone from the run.
4. Pick one migrated spec, comment out a `mockServerAction` call to make the test hit the real action. Assert the test FAILS (because the real action requires a DB row that no-one set up). Restore the mock; test passes.

### Spec mapping

US4 acceptance scenario 1.

---

## US5 — Constitution amendment landed (P3)

### Steps

1. Open `.specify/memory/constitution.md`. Confirm:
   - Top of file: SYNC IMPACT REPORT mentions v1.7.0 → v1.8.0.
   - There is a section titled `### VIII. Testing Pyramid`.
   - The section names the four layers + the decision rule.
   - The Verification Gates section shows 8 gates (with `pnpm test:component` as gate 4).

2. Ask a teammate: *"Where would you put a test that asserts the home-greeting renders 'Hey, Pavel 👋'?"* — expected answer references the constitution's decision rule and lands on component (RTL with a fixture). If the answer is "E2E", the constitution wording isn't clear enough — revise.

### Spec mapping

US5 acceptance scenarios 1 + 2.

---

## End-of-feature validation (SC verification)

After all five user stories ship:

| SC | How to verify |
|---|---|
| SC-001: component layer ≤ 30s | `time pnpm test:component` — wall clock under 30s |
| SC-002: mocked-E2E ≤ 90s | `time pnpm test:e2e-mock` — wall clock under 90s (cold webserver + tests) |
| SC-003: true-E2E ≤ 12 min | `time pnpm test:e2e-full` — wall clock under 12 min |
| SC-004: `pnpm test` ≤ 17 min | `time pnpm test` — wall clock under 17 min |
| SC-005: zero coverage regressions | Compare test-result counts pre- vs post-migration; every assertion that was green pre-015 is green at its new layer |
| SC-006: lifecycle race fixed | Wipe the test DB (`docker exec beeromat-postgres psql -U beeromat -c "DROP DATABASE beeromat_test"` + recreate). Run `pnpm test:e2e` from cold. Assert no "relation X does not exist" timeout fires |
| SC-007: new specs default to correct layer | Sample the next 5 specs merged after 015 lands; for each, confirm the test layer choice aligns with the Principle VIII decision rule |

---

## Gates the implementation must pass

All 8 gates green on every commit:

```bash
pnpm typecheck       && \
pnpm lint            && \
pnpm test:unit       && \
pnpm test:component  && \
pnpm build           && \
pnpm test:e2e        && \
pnpm i18n:check      && \
pnpm forms:check
```

Plus the lockfile-sync check (constitution VII).
